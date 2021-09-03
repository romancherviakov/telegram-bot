require('dotenv').config();
const isEmpty = require("lodash/isEmpty");
const express = require("express");
const awilix = require('awilix');
const constants = require("./constants");
const axios = require("axios");
const winston = require('winston');
const moment = require("moment");

const healthController = require("./controllers/healthController");
const callbackController = require("./controllers/callbackController");

const userService = require("./services/userService");
const db = require("./models");
const currencyService = require('./services/currencyService');
const telegramApiService = require('./services/telegramApiService');

const routing = require('./routing');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ],
});

const container = awilix.createContainer({
  injectionMode: awilix.InjectionMode.PROXY
});
container.register({
    axios: awilix.asValue(axios),
    logger: awilix.asValue(logger),
    db: awilix.asValue(db),
    userService: awilix.asFunction(userService),
    currencyService: awilix.asFunction(currencyService),
    telegramApiService: awilix.asFunction(telegramApiService),
    healthController: awilix.asFunction(healthController),
    callbackController: awilix.asFunction(callbackController)
});

const app = express();
app.use(express.json());

routing(container, app);

const port = isEmpty(process.env.EXPRESS_PORT) ? constants.DEFAULT_EXPRESS_PORT : process.env.EXPRESS_PORT;
const server = app.listen(port, () => console.log(`Started server on ${port} port`));

const ratesSchedule = [
  '10:00',
];

setInterval(async function() {
  try {
    let now = moment().format('H:m');
    if (ratesSchedule.includes(now)) {
      let users = await container.resolve('userService').getAllUsers();
      let ratesCollection = await container.resolve('currencyService').getAllCurrencyRates();
      await Promise.all(users.map(async (user) => {
        await container.resolve('telegramApiService').notifyByChatId(user.chatId, ratesCollection);
      }));
    }
  } catch (err) {
      logger.error(err.message);
  }
}, 1000*60);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  shutDownHandler();
})

process.on('uncaughtException', (err) => {
  logger.error('Shutting down application due Unhandled exception...');
  logger.error(err.message);
  logger.error(err.stack);
  shutDownHandler();
});

const shutDownHandler = function() {
  server.close(() => {
    db.sequelize.close().then(() => {
      process.exit(0);
    });
  });
}
