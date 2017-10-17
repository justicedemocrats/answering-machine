const request = require('superagent')
const phones = require('./phones')
const log = require('debug')('answering-machine:handlers')

const EXTERNAL_WEBHOOK_URL =
  process.env.EXTERNAL_WEBHOOK_URL || 'localhost:4000/api'

const getPersonId = async (person, add_tags) => {
  const response = await new Promise((resolve, reject) =>
    request
      .post(EXTERNAL_WEBHOOK_URL + '/signup')
      .send({ person, add_tags })
      .end((err, res) => {
        if (err || res.body.error) {
          log('Could not record contact: %j', err || res.body.error)
          return reject(err || res.body.error)
        }

        log('Successfully added person %s', res.body.id)
        return resolve(res.body.id)
      })
  )

  return response
}

const getContactor = async ({
  CallerName,
  FromCity,
  FromZip,
  FromState,
  Caller,
  Called
}) => {
  return await getPersonId(
    {
      given_name: CallerName && CallerName.split(' ')[1],
      family_name: CallerName && CallerName.split(' ')[0],
      postal_addresses: [{ locality: FromCity, region: FromState }],
      phone_numbers: [{ number: Caller, primary: true }],
      email_addresses: []
    },
    [phones[Called].callTag]
  )
}

const getTarget = async ({
  CallerName,
  FromCity,
  FromZip,
  FromState,
  Caller,
  Called
}) => {
  return await getPersonId(
    {
      given_name: phones[Called] && phones[Called].given_name,
      family_name: phones[Called] && phones[Called].family_name,
      phone_numbers: [{ number: Called }],
      email_addresses: [],
      postal_addresses: []
    },
    ['Action: Received Call']
  )
}

const onRecorded = async params => {
  log('Logging recorded contact with params %j', params)

  const [target, contactor] = await Promise.all([
    getContactor(params),
    getTarget(params)
  ])

  const { RecordingUrl, CallSid } = params

  const contact = {
    target,
    contactor,
    custom_fields: { recording_url: RecordingUrl },
    identifiers: [`twilio:${CallSid}`],
    origin_system: 'twilio',
    action_date: new Date(),
    contact_type: 'phone',
    status_code: 'left-voicemail',
    success: true
  }

  return await new Promise((resolve, reject) =>
    request
      .post(EXTERNAL_WEBHOOK_URL + '/record-contact')
      .send({ contact })
      .end((err, res) => {
        if (err) {
          log('Could not record contact: %j', err)
          return reject(err)
        }

        log('Successfully added contact %s', res.body.id)
        return resolve(res.body)
      })
  )
}

const onHangup = async params => {
  log('Logging hangup contact with params %j', params)

  const [target, contactor] = await Promise.all([
    getContactor(params),
    getTarget(params)
  ])

  const { CallSid } = params

  const contact = {
    target,
    contactor,
    identifiers: [`twilio:${CallSid}`],
    origin_system: 'twilio',
    action_date: new Date(),
    contact_type: 'phone',
    status_code: 'hungup',
    success: false
  }

  return await new Promise((resolve, reject) =>
    request
      .post(EXTERNAL_WEBHOOK_URL + '/record-contact')
      .send({ contact })
      .end((err, res) => {
        if (err) {
          log('Could not record contact: %j', err)
          return reject(err)
        }

        log('Successfully added contact %s', res.body.id)
        return resolve(res.body)
      })
  )
}

const onText = async params => {
  log('Logging text message with params %j', params)

  const {Body, From, FromCity, FromCountry, FromState, FromZip, To, FromName, SmsMessageSid} = params

  const as_if_call = {
    FromCity,
    FromZip,
    FromState,
    CallerName: FromName,
    Caller: From,
    Called: To
  }

  const [target, contactor] = await Promise.all([
    getContactor(as_if_call),
    getTarget(as_if_call)
  ])

  const contact = {
    target,
    contactor,
    custom_fields: {body: Body},
    identifiers: [`twilio:${SmsMessageSid}`],
    origin_system: 'twilio',
    action_date: new Date(),
    contact_type: 'sms',
    status_code: 'success',
    success: true
  }

  return await new Promise((resolve, reject) =>
    request
      .post(EXTERNAL_WEBHOOK_URL + '/record-contact')
      .send({ contact })
      .end((err, res) => {
        if (err) {
          log('Could not record contact: %j', err)
          return reject(err)
        }

        log('Successfully added contact %s', res.body.id)
        return resolve(res.body)
      })
  )
}

module.exports = { onHangup, onRecorded, onText }
