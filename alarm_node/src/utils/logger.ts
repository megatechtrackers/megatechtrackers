import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import config from '../config';

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'alarm-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          info => `${info.timestamp} ${info.level}: ${info.message}`
        )
      )
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'alarm.log'),
      maxsize: 10485760,
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'alarm-error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
      tailable: true
    })
  ]
});

export default logger;
