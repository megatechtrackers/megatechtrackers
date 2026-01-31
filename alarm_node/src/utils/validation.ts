import * as Joi from 'joi';
import { ValidationError } from './errors';
import { Alarm, Contact } from '../types';

const alarmSchema = Joi.object({
  id: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string()
  ).required(),
  imei: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string()
  ).required(),
  server_time: Joi.date().required(),
  gps_time: Joi.date().required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  altitude: Joi.number().integer().default(0),
  angle: Joi.number().integer().min(0).max(360).default(0),
  satellites: Joi.number().integer().min(0).default(0),
  speed: Joi.number().integer().min(0).default(0),
  status: Joi.string().required(),
  is_sms: Joi.alternatives().try(Joi.boolean(), Joi.number().valid(0, 1)).default(false),
  is_email: Joi.alternatives().try(Joi.boolean(), Joi.number().valid(0, 1)).default(false),
  is_call: Joi.alternatives().try(Joi.boolean(), Joi.number().valid(0, 1)).default(false),
  is_valid: Joi.alternatives().try(Joi.boolean(), Joi.number().valid(0, 1)).default(true),
  reference_id: Joi.number().integer().allow(null).optional(),
  distance: Joi.number().allow(null).optional(),
  sms_sent: Joi.boolean().default(false),
  email_sent: Joi.boolean().default(false),
}).unknown(true);

const contactSchema = Joi.object({
  email: Joi.string().email().allow(null).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).allow(null).optional(),
  contact_name: Joi.string().optional(),
  priority: Joi.number().integer().min(1).default(1),
  active: Joi.boolean().default(true),
}).or('email', 'phone');

export function validateAlarm(alarm: any): Alarm {
  const { error, value } = alarmSchema.validate(alarm, {
    abortEarly: false,
    convert: true,
    stripUnknown: false
  });

  if (error) {
    const details = error.details.map(d => d.message).join('; ');
    throw new ValidationError(`Invalid alarm payload: ${details}`);
  }

  return value as Alarm;
}

export function validateContact(contact: any): Contact {
  const { error, value } = contactSchema.validate(contact, {
    abortEarly: false,
    convert: true
  });

  if (error) {
    const details = error.details.map(d => d.message).join('; ');
    throw new ValidationError(`Invalid contact: ${details}`);
  }

  return value as Contact;
}
