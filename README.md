# reradio
Raspberry Pi program acting as Airplay speaker and simple radio alarm clock, with HTTP and MQQT/Homekit interface.

I bought an old radio from the 1940s and mounted a Raspberry Pi with WiFi, an amplifier and a speaker. I run this node.js script.
This turns the radio into an Airplay speaker, and it wakes me up on weekdays with the local radio news channel.

I can do simple control by a web page, and now it also listens to an mqtt broker, which can turn the radio on and off. This
lets me turn the radio on or off with Apple's HomeKit software, including Siri voice control.
