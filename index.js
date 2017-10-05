const express = require('express')
const VoiceResponse = require('twilio').twiml.VoiceResponse
const bodyParser = require('body-parser')
const log = require('debug')('answering-machine')
const request = require('superagent')
const phones = require('phones')
const app = express()

const RECORDING_STATUS_CALLBACK =
  process.env.RECORDING_STATUS_CALLBACK || 'localhost:3000/recorded'

const EXTERNAL_WEBHOOK_URL =
  process.env.EXTERNAL_WEBHOOK_URL || 'localhost:4000/api/contact-helper'

const callsInProgress = {}

/*
 * GET /health
 */
app.get('/health', (req, res) => {
  log('GET /health')

  res.json({ healthy: true })
})

/*
 * GET /record
 *
 * Responds to twilio with twiml saying play this message, then record
 * Stores information about the call in global callsInProgress
 */
app.get('/record', (req, res) => {
  log('POST /record')

  const {
    CallerName,
    FromCity,
    FromZip,
    FromState,
    Caller,
    Called,
    CallSid
  } = req.query

  callsInProgress[CallSid] = {
    CallerName,
    FromCity,
    FromZip,
    FromState,
    Caller,
    Called,
    CallSid
  }

  const twiml = new VoiceResponse()

  if (phones[Called].voiceMessageUrl)
    twiml.play({}, phones[Called].voiceMessageUrl)

  twiml.record({
    maxLength: 60,
    recordingStatusCallback: process.env.RECORDING_STATUS_CALLBACK,
    recordingStatusCallbackMethod: 'GET'
  })

  twiml.hangup()

  res.type('text/xml')
  return res.send(twiml.toString())
})

/*
 * GET /recorded
 *
 * Gets a callback after the caller has hung up and the recording has been processed
 * Does posting to the webhook
 */
app.get('/recorded', (req, res) => {
  log('POST /recorded')

  res.sendStatus(200)

  const { RecordingUrl, CallSid } = req.query

  const {
    CallerName,
    FromCity,
    FromZip,
    FromState,
    Caller,
    Called,
    CallSid
  } = callsInProgress[CallSid]

  const person = {
    given_name: CallerName.split(' ')[1],
    family_name: CallerName.split(' ')[0],
    postal_addresses: [{ locality: FromCity, region: FromState }],
    phone_numbers: [{ number: Caller, primary: true }]
  }

  request
    .post(EXTERNAL_WEBHOOK_URL)
    .send({ person, add_tags: [phones[Called].callTag] })
    .end((err, res) => {
      log(
        'Successfully added %s, who called campaign %s',
        Called,
        phones[Called].callTag
      )
    })

  callsInProgress[CallSid] = undefined
  delete callsInProgress[CallSid]
})

/*
 * Fire it up
 */

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  log('Listening on port %s', PORT)
})
