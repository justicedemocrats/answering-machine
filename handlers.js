const request = require('superagent')
const phones = require('./phones')
const log = require('debug')('answering-machine:handlers')

const EXTERNAL_WEBHOOK_BASE =
  process.env.EXTERNAL_WEBHOOK_URL || 'localhost:4000/api'

const getPersonId = async (person, add_tags) => {
  const response = await new Promise((resolve, reject) =>
    request
      .post(EXTERNAL_WEBHOOK_URL)
      .send({ person, add_tags })
      .end((err, res) => {
        if (err) return reject(err)
        if (res.body.error) return reject(err)

        log(
          'Successfully added %s, who called campaign %s',
          Caller,
          phones[Called].callTag
        )

        resolve(res.body)
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
    contact_type: 'phone',
    status_code: 'left-voicemail',
    success: true
  }

  return await new Promise((resolve, reject) =>
    request
      .post(EXTERNAL_WEBHOOK_URL + '/record-contact')
      .send({ contact })
      .end((err, res) => (err ? reject(err) : resolve(res.body)))
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
    status_code: 'hungup',
    success: false
  }

  return await new Promise((resolve, reject) =>
    request
      .post(EXTERNAL_WEBHOOK_URL + '/record-contact')
      .send({ contact })
      .end((err, res) => (err ? reject(err) : resolve(res.body)))
  )
}

module.exports = { onHangup, onRecorded }
