const express = require('express')
const VoiceResponse = require('twilio').twiml.VoiceResponse
const bodyParser = require('body-parser')
const log = require('debug')('answering-machine')
const request = require('superagent')
const phones = require('./phones')
const app = express()
const { onHangup, onRecorded } = require('./handlers')

const RECORDING_STATUS_CALLBACK =
  process.env.RECORDING_STATUS_CALLBACK || 'localhost:3000/recorded'

const SURGE_SUBDOMAIN = process.env.SURGE_SUBDOMAIN

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
    data: {
      CallerName,
      FromCity,
      FromZip,
      FromState,
      Caller,
      Called,
      CallSid
    },
    timeout: setTimeout(() => onHangup(req.query), 10000)
  }

  log('GET /record from phone: %s, name: %s', Called, CallerName)

  const twiml = new VoiceResponse()

  const audioResponse = `https://${SURGE_SUBDOMAIN}.surge.sh/${phones[Called].voiceMessageUrl}`

  log('Answering with audio %s', audioResponse)

  if (phones[Called].voiceMessageUrl)
    twiml.play(
      {},
      audioResponse
    )

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
  log('GET /recorded')

  res.sendStatus(200)

  const { RecordingUrl, CallSid } = req.query

  const {
    CallerName,
    FromCity,
    FromZip,
    FromState,
    Caller,
    Called
  } = callsInProgress[CallSid].data

  clearTimeout(callsInProgress[CallSid].timeout)

  onRecorded({
    RecordingUrl,
    CallSid,
    CallerName,
    FromCity,
    FromZip,
    FromState,
    Caller,
    Called
  })

  callsInProgress[CallSid] = undefined
  delete callsInProgress[CallSid]
})

/*
 * GET /sms
 *
 * Gets a callback once a text has been received
 */
app.get('sms', (req, res) => {
  log('GET /sms')

  res.sendStatus(200)
})

/*
 * Fire it up
 */

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  log('Listening on port %s', PORT)
})
