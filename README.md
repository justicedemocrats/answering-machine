# answering-machine
A little Twilio based answering machine in NodeJS. You can forward calls to a real
phone, and then if the person doesn't answer, sends it to the Twilio voicemail,
records their message, and does something with it.

## Usage

To deploy to heroku:
```bash
git clone https://github.com/justicedemocrats/answering-machine.git

# Create phones.js - instructions below
# Edit handlers.js - instructions below

heroku create my-answering-machine
git push heroku master
```

Finally, you must configure the numbers in Twilio. When a call is received, you
set it so that it sends a POST to `https://my-answering-machine.herokuapp.com/call`,
and that when texts are received, it sends a POST to `https://my-answering-machine.herokuapp.com/sms`.

## Setting up Voicemails

In order for Twilio to play your voicemails, they need to be hosted somewhere.

[Surge](surge.sh) makes this pretty easy.

I put all my .mp3s (they have to be .mp3s) in a folder called `audio`, and then
ran `surge -d my-answering-machine-audio -p ./audio`, and voila! If I had `voicemail.mp3`
in audio, I can now visit `my-answering-machine-audio.surge.sh/voicemail.mp3` and
it'll play in my browser.

Run `heroku config:set SURGE_SUBDOMAIN=my-answering-machine-audio`, or whatever your
surge subdomain was, and then you can refer to that voicemail snippet by `voicemail.mp3`
in `phones.js`.

## Phones.js

You must create a configuration file called `phones.js`, that exports an object
with phone numbers as keys.

If you want to forward the number, the phone object should have a `forwardTo` object.
If no `forwardTo` is present, it will go straight to voicemail.

Finally, you should include any other fields that you'll want to associate with your number
use in your `handlers.js`.

The sample `handlers.js` makes a POST to record the contact loosely following the
[OSDI spec](https://opensupporter.github.io/osdi-docs/record_canvass.html), but yours
will probably do something different.

Here's a minimal `phones.js` for two numbers, one forwarding one not, both with voicemails:
```javascript
module.exports = {
  '+12137000860': {
    note: "James's line",
    callTag: 'Called: James',
    voiceMessageUrl: 'james-answering-machine.mp3',
    forwardTo: '+15555555555'
  },
  '+14609602314': {
    note: "Tyson's line",
    callTag: 'Called: Tyson',
    voiceMessageUrl: 'tyson-answering-machine.mp3'
  }
}
```
