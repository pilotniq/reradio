// TODO: Add web interface to turn off, adjust volume?, set time?

// 2016-10-18 - add mqtt support for control by Apple HomeKit

var child_process = require('child_process')
var http = require('http')
var dispatcher = require( 'httpdispatcher' )
var fs = require('fs');
var url = require( 'url' );
var express = require( 'express' );
var storage = require( 'node-persist' );
var loudness = require( 'loudness' );
var mqtt = require( 'mqtt' );

// Calculate delay until next alarm
var oneMinuteInMs = 1000 * 60;
var oneHourInMs = 1000 * 60 * 60;
var oneDayInMs = oneHourInMs * 24;
var alarmTimeout;
var alarmTimeHM;
var alarmEnabled = true;

function Radio()
{
    this.state = false;
}

Radio.prototype.turnOn = function( wakeUp ) {
    console.log( "radio.turnOn: entry, state=" + this.state );

    if( !this.state )
    {
	console.log( "Radio: Turning on" );
      this.state = true;

      loudness.setVolume( 85, function( err ) { if( err ) console.log( "radio: setVolume: " + err ); } );

      if( wakeUp )
        this.audioChildProcess = child_process.spawn( 'mpg123', ['-q', '-@', 'alarmPlaylist.m3u' ] );
      else
        this.audioChildProcess = child_process.spawn( 'mpg123', ['-q', '-@', 'p1.m3u' ] );

      var theRadio = this

      this.audioChildProcess.on( 'error', function( err ) { console.log( "radio error: " + err ); theRadio.state = false } );
      this.audioChildProcess.on( 'close', function( code, signal ) { 
  	console.log( "radio: child process terminated with code " + code );
	theRadio.state = false;
	console.log( "radio: close: state=" + theRadio.state + ", " + radio.state + ", " + this.state  );
	// restore volume to standard 0 dB
	loudness.setVolume( 100, 
			    function( err ) 
			    { 
				console.log( "alarmTriggered: child process terminated, set volume error " + err );
				this.state = false;
			    } );
      } );
    }
    else
	console.log( "Radio: Asked to Turn on, but was already on" );
};

Radio.prototype.turnOff = function() {
    if( this.state )
    {
      console.log( "Radio: Turning off" );
      this.audioChildProcess.kill();
    }
    else
	console.log( "Radio: Asked to Turn off, but was already off" );
	
}

var radio = new Radio();

function getNextAlarmTime( hm )
{
    var now = new Date()

    // Sunday = 0
    var weekday = now.getDay()
    var alarmTime = new Date( now.getTime() ); // start this way
    
    console.log( "getNextAlarmTIme( hm.h=" + hm.h + ", hm.m=" + hm.m );

    console.log( "getAlarmTime: first alarmTime=" + alarmTime + 
		 ", hours=" + hm.h + ", weekday=" + weekday );
    
    alarmTime.setHours( hm.h );

    console.log( "getAlarmTime: after setHours=" + alarmTime );

    alarmTime.setMinutes( hm.m );

    console.log( "getAlarmTime: after setMinutes=" + alarmTime );
    alarmTime.setSeconds( 0 );


    console.log( "now.getHours=" + now.getHours() + ", alarmTime before switch: " + alarmTime + ", weekday=" + weekday )

// End goal is to construct a date 
    switch( weekday )
    {
    case 0:
	// create a date of 00:00 this day
	alarmTime = new Date( alarmTime.getTime() + oneDayInMs );
	break;
	
    case 6:
	alarmTime = new Date( alarmTime.getTime() + 2 * oneDayInMs );
	break;

    default:
	// console.log( "now.getHours()=" + now.getHours() + ", now.getMinutes()
	if( now.getHours() > hm.h || ( (now.getHours() == hm.h) && (now.getMinutes() >= hm.m) ) )
	{
	    var skipDays;
	    // we are past the alarm time
	    if( weekday == 5 )
		skipDays = 3;
	    else
		skipDays = 1;
	    
	    console.log( "skipDays = " + skipDays );
	    alarmTime = new Date( alarmTime.getTime() + skipDays * oneDayInMs );
	}
    }
    
    console.log( "getAlarmTime: returning " + alarmTime );
    
    return alarmTime;
}


function alarmWaitCallback( alarmTime, alarmFunc, alarmHours, alarmMinutes )
{
    console.log( "Entering alarmWaitCallback" );

    var now = new Date()

    var dT = alarmTime.getTime() - now.getTime();
    
    console.log( "alarmTime=" + alarmTime.toLocaleString() );
    console.log( "now=" + now.toLocaleString() );

    if( dT <= 0 )
    {
	alarmFunc() // actually, just schedule this

	console.log( "alarmWaitCallback: Calling getNextAlarmTime with alarmHours=" + alarmHours + ", m=" + alarmMinutes );
	alarmTime = getNextAlarmTime( { h: alarmHours, m: alarmMinutes} );
	console.log( "Next alarm time: " + alarmTime.toLocaleString() );
	dT = alarmTime.getTime() - now.getTime();
    }

    console.log( "dT = " + dT );
    
    var delay = dT;

    if( dT > oneHourInMs )
	dT = oneHourInMs;
    
    alarmTimeout = setTimeout( function() { alarmWaitCallback( alarmTime, alarmFunc, alarmHours, alarmMinutes ) }, delay );
}
var audioChildProcess;

function setAlarmTime( hm )
{
    console.log( "setAlarmTime: entering" );
    alarmTimeHM = hm;

    storage.setItem( 'time', alarmTimeHM );

    if( alarmTimeout )
    {
	clearTimeout( alarmTimeout );
	alarmTimeout = null;
	console.log( "Cleared alarmTimeout" );
    }

    if( alarmEnabled )
    {
	console.log( "setAlarmTime: calling getNextAlarmTime, hm=" + hm.h + ":" + hm.m );

	alarmWaitCallback( getNextAlarmTime( hm ), 
			   alarmTriggered, hm.h, hm.m )
    }
    console.log( "setAlarmTime: leaving" );
}

function getAlarmTime()
{
    return alarmTimeHM;
}

function alarmTriggered()
{
    console.log( "Alarm!" );

    radio.turnOn( true );
    // call ogg123

    // set volume to -39 dB (value 70)
    // increased volume one step 2015-12-17
    // increased volume one step 2016-03-08
    // couldn't hear volume 2016-09-12. Changed to 90
    // 2016-09-16: loudness is a bit loud. Changed from 90 to 85
/*
    loudness.setVolume( 85, function( err ) { if( err ) console.log( "alarmTriggered: setVolume: " + err ); } );

    audioChildProcess = child_process.spawn( 'mpg123', ['-q', '-@', 'alarmPlaylist.m3u' ] );
    audioChildProcess.on( 'error', function( err ) { console.log( "alarm error: " + err ) } );;
    audioChildProcess.on( 'close', function( code, signal ) { 
	console.log( "alarmTriggered: child process terminated with code " + code );
	// restore volume to standard 0 dB
	loudness.setVolume( 100, function( err ) { console.log( "alarmTriggered: child process terminated, set volume error " + err ); } );
    } );
*/
//
////n                                    function callback( error, stdout, stderr ) 
//                                    { console.log( "exec Callback: error=" + error );} );
    // setTimeout( function() { console.log( "Killing!" ); audioChildProcess.kill(); }, 5000 );
}

function parseTime( time )
{
    var splitTime = time.split( ":" );
    var h, m;

    h = splitTime[0];
    m = splitTime[1];

    return { h: h, m: m};
}

storage.initSync();
hm = storage.getItem( 'time' );
console.log( "Got storage time " + JSON.stringify( hm ) );
if( !hm || !hm.m || !hm.h)
{
    hm = { h: 6, m:21 };
}

setAlarmTime( hm );

enabled = storage.getItem( 'alarmEnabled' );
console.log( "Stored alarmEnabled = " + enabled );

setEnabled( enabled );

var options = {
    port: 1883,
    host: 'tvpaj.local', // '192.168.1.155',                                                                         
    clienatId: 'Reradio'
};
var client = mqtt.connect(options);

client.on('connect', function () {
    client.subscribe('Reradio')
//    clrient.publish('presence', 'Hello mqtt')
})
 
client.on('message', function (topic, message) {
  // message is Buffer 
    console.log( "MQTT: topic=" + topic + ", message=" + message.toString() )

    if( message == "on" )
	radio.turnOn( false );
    else if( message == "off" )
	radio.turnOff();
  //  client.end()
})

function setEnabled( newEnabled )
{
    console.log( "setEnabled called with " + newEnabled );
    if( alarmEnabled == newEnabled )
	return; // do nothing

    alarmEnabled = newEnabled;
    storage.setItem( 'alarmEnabled', alarmEnabled );

    if( alarmEnabled )
    {
	console.log( "setEnabled: calling getNextAlarmTime with " + alarmTimeHM.h + ":" + alarmTimeHM.m + ", timeout=" + alarmTimeout );

	if( alarmTimeout )
	{
	  clearTimeout( alarmTimeout );
	  alarmTimeout = null;
	  console.log( "Cleared alarmTimeout" );
	}
  
	alarmWaitCallback( getNextAlarmTime( alarmTimeHM ), 
			   alarmTriggered, alarmTimeHM.h, alarmTimeHM.m )
    }
    else
	clearTimeout( alarmTimeout );
}

// alarmWaitCallback( getAlarmTime( h, m ), alarmTriggered, h, m )


// Web User interface
function handleRequest( request, response )
{
    console.log( 'handleRequest: request URL=' + request.url )
    
    try
    {
	dispatcher.dispatch( request, response );
    }
    catch( err )
    {
	console.log( err );
    }
}

var indexHTML = fs.readFileSync( 'resources/index.html' );

dispatcher.onGet( "/", function( req, res ) {
    res.writeHead( 200, {'Content-Type': 'text/html' } );
    res.end( indexHTML );
})

dispatcher.onGet( "/trigger", function( req, res ) {
    res.writeHead( 200, {'Content-Type': 'text/html' } );
    alarmTriggered();
    res.end( "Triggered." );
})

dispatcher.onGet( "/api/nextAlarmTime", function( req, res ) {
    res.writeHead( 200, {'Content-Type': 'text/plain' } );
    console.log( "displatcher.onGet nextAlarmTime: calling with alarmTimeHM=" + alarmTimeHM.h + ":" + alarmTimeHM.m );

    res.end( String( getNextAlarmTime( alarmTimeHM ) ) );
})

dispatcher.onGet( "/api/time", function( req, res ) {
    console.log( "getTime called." );
    res.writeHead( 200, {'Content-Type': 'text/plain' } );
    
    var result = ('00' + alarmTimeHM.h).slice(-2) + ":" + ('00' + alarmTimeHM.m).slice(-2);
    console.log( "Returning '" + result + "'" );
    res.end( result );
})

dispatcher.onGet( "/api/enabled", function( req, res ) {
    console.log( "getEnabled called." );
    res.writeHead( 200, {'Content-Type': 'text/plain' } );
    
    var result = alarmEnabled;
    console.log( "Returning '" + result + "'" );
    res.end( result );
})


dispatcher.onPost( "/api/enabled", function( req, res ) {
    console.log( "Setting Enabled" );
    setEnabled( req.body );
    res.end( "Enable call executed" );
})

dispatcher.onPost( "/api/time", function( req, res ) {
    console.log( "Setting Time" );
    // var body = '';
    console.log( "setTime, body=" + req.body );

    hm = parseTime( req.body);
    /*
    var splitTime = req.body.split( ":" );
    h = splitTime[0];
    m = splitTime[1];
    */
    storage.setItem( 'time', hm );
    setAlarmTime( hm );
    res.end( "<p>Time set to: " + hm.h + ":" + hm.mm + "</p>" );

    /*
    req.on( 'data', function( data ) {
	console.log( "dispatcher.onPost api time got data" );
	body += data;
	if( body.length > 1e4 )
	    request.connection.destroy();
    } );
    req.on( 'end', function() {
	console.log( "Body: " + body );

	res.writeHead( 200, {'Content-Type': 'text/plain' } );
	res.end("Time set.");
    });
*/
/*
    var parsedQuery = url.parse( req.url, true );
    console.log( "Request: " + JSON.stringify(req) );
    console.log( "parsedQuery: " + JSON.stringify(parsedQuery) );
    var timeString = parsedQuery.query.time;
    var splitTime = timeString.split( ":" );

    console.log( "Parsed query time = " + JSON.stringify(timeString) );
    
    // parse time
    h = splitTime[0];
    m = splitTime[1];
    res.end( "<p>Time set to: " + h + ":" + m + "</p>" );
*/
})

dispatcher.onPost( "/api/stopAlarm", function( req, res ) {
    console.log( "Stopping" );
    res.writeHead( 200, {'Content-Type': 'text/plain' } );
  
    radio.turnOff();
    res.end( "<p>Radio turned off</p>" );
/*
    if( audioChildProcess )
    {
       audioChildProcess.kill();
       res.end( "<b>Music stopped</p>" );
    }
    else
      res.end( "<b>Music was not playing</p>" );
*/
})

var server = http.createServer( handleRequest );

server.listen( 80, function() {
    console.log( "Server listening on http://localhost:80" );
} );