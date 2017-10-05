const express = require('express')
const VoiceResponse = require('twilio').twiml.VoiceResponse
const bodyParser = require('body-parser')
const log = require('debug')('answering-machine')
const request = require('superagent')
const app = express()

const RECORDING_STATUS_CALLBACK =
  process.env.RECORDING_STATUS_CALLBACK || 'localhost:3000/recorded'

const EXTERNAL_WEBHOOK_URL =
  process.env.EXTERNAL_WEBHOOK_URL || 'localhost:4000/api/contact-helper'

app.use(bodyParser.json())

app.get('/health', (req, res) => {
  log('GET /health')

  res.json({ healthy: true })
})

app.post('/record', (req, res) => {
  log('POST /record')
  console.log(req.body)

  const twiml = new VoiceResponse()

  twiml.record({
    maxLength: 60,
    recordingStatusCallback: process.env.RECORDING_STATUS_CALLBACK
  })

  twiml.hangup()

  res.type('text/xml')
  res.send(twiml.toString())
})

app.post('/recorded', (req, res) => {
  log('POST /record')
  console.log(req.body)

  res.sendStatus(200)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  log('Listening on port %s', PORT)
})
