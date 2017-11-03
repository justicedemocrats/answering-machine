const express = require('express')
const { VoiceResponse, MessagingResponse } = require('twilio').twiml
const bodyParser = require('body-parser')
const log = require('debug')('answering-machine')
const request = require('superagent')
const phones = require('./phones')
const app = express()
const { onHangup, onRecorded, onText } = require('./handlers')

app.use(bodyParser.json())
app.use(bodyParser.urlencoded())

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
app.post('/call', (req, res) => {
  const {
    CallerName,
    FromCity,
    FromZip,
    FromState,
    Caller,
    Called,
    CallSid
  } = req.body

  log('POST /call from phone: %s', Called)

  const twiml = new VoiceResponse()

  if (phones[Called].forwardTo) {
    // Begin forward flow
    console.log(`Forward flow with ${phones[Called].forwardTo}`)
    const dial = twiml.dial({ action: '/call-complete', timeout: 10 })
    const url = '/press-one'
    dial.number({ url }, phones[Called].forwardTo)
    twiml.hangup()
  } else {
    // Straight to voicemail
    const voiceUrl = phones[req.body.Called].voiceMessageUrl
    const audioResponse = `https://${SURGE_SUBDOMAIN}.surge.sh/${voiceUrl}`
    twiml.play({}, audioResponse)
    twiml.record({
      maxLength: 60,
      action: process.env.RECORDING_STATUS_CALLBACK
    })

    // Queue timeout in case they don't leave a voicemail
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
      timeout: setTimeout(() => onHangup(req.body), 100000)
    }
  }

  res.type('text/xml')
  console.log(twiml.toString())
  return res.send(twiml.toString())
})

app.post('/press-one', (req, res) => {
  log('POST /press-one')
  log(req.body)

  const twiml = new VoiceResponse()
  const gather = twiml.gather({
    numDigits: 1,
    action: '/gather-result'
  })

  const voice = 'Alice'
  gather.say({ voice }, 'You are receiving a campaign call, press 1 to accept.')

  twiml.hangup()

  res.type('text/xml')
  console.log(twiml.toString())
  res.send(twiml.toString())
})

/*
 * POST /gather-result
 *
 * Either they pressed one, or they didn't press one / it went to voicemail
 * This endpoint just hangs up if they didn't press anything and passes the call to /call-complete
 *
 * This endpoint is not triggered if the phone does not have a forward to set
 */
app.post('/gather-result', (req, res) => {
  log('POST /gather-result')
  log(req.body)
  log(req.params)

  const twiml = new VoiceResponse()

  if (!req.body.Digits || req.body.Digits.length == 0) {
    twiml.hangup()
  }

  res.type('text/xml')
  console.log(twiml.toString())
  res.send(twiml.toString())
})

/*
 * POST /call-complete
 *
 * Happens at the end of a forwarding call
 *
 *
 */
app.post('/call-complete', (req, res) => {
  log('POST /call-complete')
  log(req.body)

  const twiml = new VoiceResponse()

  if (['completed', 'answered'].includes(req.body['DialCallStatus'])) {
    twiml.hangup()
  } else {
    const audioResponse = `https://${SURGE_SUBDOMAIN}.surge.sh/${phones[
      req.body.Called
    ].voiceMessageUrl}`
    twiml.play({}, audioResponse)
    twiml.record({
      maxLength: 60,
      action: process.env.RECORDING_STATUS_CALLBACK
    })
  }

  res.type('text/xml')
  console.log(twiml.toString())
  return res.send(twiml.toString())
})

/*
 * POST /recorded
 *
 * Gets a callback after the caller has hung up and the recording has been processed
 * Does posting to the webhook
 */

app.post('/recorded', (req, res) => {
  log('POST /recorded')

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
 * POST /sms
 *
 * Gets a callback once a text has been received
 */
app.post('/sms', (req, res) => {
  log('GET /sms')

  const {
    Body,
    From,
    FromCity,
    FromCountry,
    FromState,
    FromZip,
    FromName,
    To,
    SmsMessageSid
  } = req.body

  onText({
    Body,
    From,
    FromCity,
    FromCountry,
    FromState,
    FromZip,
    To,
    FromName,
    SmsMessageSid
  })

  const twiml = new MessagingResponse()
  res.writeHead(200, { 'Content-Type': 'text/xml' })
  res.end(twiml.toString())
})

/*
 * Fire it up
 */

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  log('Listening on port %s', PORT)
})
