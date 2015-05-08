function WebRTCCall () {

  Deps.autorun(function() {
    console.log(Meteor.userId());
    Meteor.ClientCall.setClientId(Meteor.userId());
  });

  var pc_config =
    webrtcDetectedBrowser === 'firefox' ?
    {'iceServers':[{'url':'stun:23.21.150.121'}]} :
    {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};
  var pc_constraints = {
    'optional': [
      {'DtlsSrtpKeyAgreement': true}
    ]};
  var sdpConstraints = {};
  var constraints = {video: true, audio: true};

  var isInitiator = false;
  var isChannelReady = false;
  var isStarted = false;

  var localStream;
  var remoteStream;

  var remoteUsername;

  var pc;

  var onNewCallCallback;
  var onCallRefusedCallback;
  var onHangupCallback;
  var onRemoteHangupCallback;
  var onGetUserMediaErrorCallback;
  var onDataChannelReadyCallback;

  var localVideoId;
  var remoteVideoId;

  // Data channel information
  var sendChannel, receiveChannel;
  var receiveTextarea = document.getElementById("dataChannelReceive");

  // Opera --> getUserMedia
  // Chrome --> webkitGetUserMedia
  // Firefox --> mozGetUserMedia
  navigator.getUserMedia = navigator.getUserMedia ||
  navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

  Deps.autorun(function () {
    console.log("Your favorite food is " + pc);
    if (pc)
  console.log("Your favorite food is " + pc.iceGatheringState);
  });

  this.call = function(username, callback) {

    var cb = function (error, result) {
      if (!error) {
        console.log(result);
        isChannelReady = true;
      } else {
        console.log(error.error);
      }
    };

    isInitiator = true;
    if (!Meteor.users.findOne({username : username})) {
      // invalid username
      callback({error : "User not found"});
    } else {
      remoteUsername = username;
      Meteor.call('initiateCall', Meteor.user().username, username, cb);
      callback({});
    }
  };

  this.onCall= function(callback) {
    onNewCallCallback = callback;
  };

  this.acceptCall = function(callback) {
    console.log('Accepted call');
    isChannelReady = true;
    navigator.getUserMedia(constraints, getUserMediaHandler, getUserMediaErrorHandler);
    console.log('Getting user media with constraints', constraints);
    Meteor.call('acceptCall', Session.get('caller'), Meteor.user().username);
    remoteUsername = Session.get('caller');
    callback(remoteUsername);
  };

  this.refuseCall = function(callback) {
    var callmate = Session.get('caller')
    Meteor.call('refuseCall', callmate);
    callback(callmate);
  }

  this.attachLocalVideo = function(id) {
    localVideoId = id;
  };

  this.attachRemoteVideo = function(id) {
    remoteVideoId = id;
  };

  this.hangup = function(callback) {
    Meteor.call('terminateCall', Meteor.user().username, Session.get('callee'), callback);
    stop();
    onHangupCallback();
  };

  this.onCallRefused = function(callback) {
    onCallRefusedCallback = callback;
  };

  this.onGetUserMediaError = function (callback) {
    onGetUserMediaErrorCallback = callback;
  }

  this.onHangup = function(callback) {
    onHangupCallback = callback;
  };

  this.onRemoteHangup = function(callback) {
    onRemoteHangupCallback = callback;
  };

  Meteor.ClientCall.methods({
    callRequested : function(caller) {
      Session.set('caller', caller);
      console.log('Received callRequest : ' + caller + ' want to call. Accept ?');
      onNewCallCallback(caller);
    },

    callAccepted : function(callee) {
      Session.set('callee', callee);
      console.log('Nice to get a call from you ' + callee);
    },

    callRefused : function(caller) {
      console.log("Call refused");
      onCallRefusedCallback();
    },

    log : function (array){
      console.log.apply(console, array);
    },

    message : function (message){

      if (message === 'got user media') {
        console.log('Received message:', message);
        if (isInitiator) {
          navigator.getUserMedia(constraints, getUserMediaHandler, getUserMediaErrorHandler);
        }
        checkAndStart();
      } else if (message.type === 'offer') {
        console.log('Received message : offer' + isStarted + ", " + localStream + ", " + isChannelReady);
        if (isInitiator) {

        //setTimeout(function() {
        checkAndStart();
        if (pc) {
          pc.setRemoteDescription(new RTCSessionDescription(message));
          doAnswer();
        }
      //}, 1000);
      } else {
        checkAndStart();
        if (pc) {
          pc.setRemoteDescription(new RTCSessionDescription(message));
          doAnswer();
        }
      }
      } else if (message.type === 'answer' && isStarted) {
        console.log('Received message : answer');
        pc.setRemoteDescription(new RTCSessionDescription(message));
      } else if (message.type === 'candidate' && isStarted) {
        console.log('Received message : candidate');
        var candidate = new RTCIceCandidate({sdpMLineIndex:message.label,
          candidate:message.candidate});
        pc.addIceCandidate(candidate);
      } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
      }
    }
  });

  window.onbeforeunload = function(e){
    if (isStarted)
      hangup();
  };

  // getUserMedia() handlers...
  function getUserMediaHandler(stream) {
    console.log('getUserMedia succeded with constraints', constraints);
    localStream = stream;
    var localVideo = document.querySelector('#' + localVideoId);
    attachMediaStream(localVideo, stream);
    console.log('Adding local stream.');
    sendMessage('got user media');
  }
  function getUserMediaErrorHandler(error){
    console.log('navigator.getUserMedia error: ', error);
    Meteor.call('refuseCall', Session.get('caller'));
    onGetUserMediaErrorCallback();

  }
  // Channel negotiation trigger function
  function checkAndStart() {
    if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {
      console.log("I'm here !!!");
      createPeerConnection();
      isStarted = true;
      doCall();
    }
  }
  // PeerConnection management...
  function createPeerConnection() {
    try {
      pc = new RTCPeerConnection(pc_config, pc_constraints);
      pc.addStream(localStream);
      pc.onicecandidate = handleIceCandidate;
      pc.oniceconnectionstatechange = function(e) { console.log("iceConnectionSTate" + e.currentTarget.iceGatheringState + ", " + e.currentTarget.iceConnectionState + ", " + e.currentTarget.signalingState);};
      pc.onicegatheringstatechange = function(e) { console.log("iceGathering" + e.currentTarget.iceGatheringState + ", " + e.currentTarget.iceConnectionState + ", " + e.currentTarget.signalingState);};
      pc.onnegotiationneeded = function(e) { console.log(e.currentTarget.iceGatheringState + ", " + e.currentTarget.iceConnectionState + ", " + e.currentTarget.signalingState);};
      pc.onsignalingstatechange = function(e) { console.log("signaling" + e.currentTarget.iceGatheringState + ", " + e.currentTarget.iceConnectionState + ", " + e.currentTarget.signalingState);};
      console.log('Created RTCPeerConnnection with:\n' +
      ' config: \'' + JSON.stringify(pc_config) + '\';\n' +
      ' constraints: \'' + JSON.stringify(pc_constraints) + '\'.');
    } catch (e) {
      console.log('Failed to create PeerConnection, exception: ' + e.message);
      alert('Cannot create RTCPeerConnection object.');
      return;
    }
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;

    if (isInitiator) {
      console.log('Creating data channel for sender');
      try {
        // Create a reliable data channel
        sendChannel = pc.createDataChannel("sendDataChannel",
          {reliable: false});
        trace('Created send data channel');
      } catch (e) {
        alert('Failed to create data channel. ');
        trace('createDataChannel() failed with exception: ' + e.message);
      }
      console.log("Adding send channel" + pc.iceGatheringState + ", " + pc.iceConnectionState + ", " + pc.signalingState);
      sendChannel.onopen = handleSendChannelStateChange;
      sendChannel.onmessage = handleMessage;
      sendChannel.onclose = handleSendChannelStateChange;
      sendChannel.onerror = function(e){console.log("DataChannel ERROR!!!" + e)};
      pc.onsignalingstatechange = function(e) {
        console.log("signalinggggggg " + e.currentTarget.iceGatheringState + ", " + e.currentTarget.iceConnectionState + ", " + e.currentTarget.signalingState);
        if (e.currentTarget.signalingState === 'stable') {
          while (!pc);
          doAnswer();
        }
      }
    } else { // Joiner
      console.log('Creating data channel for receiver');
      pc.ondatachannel = gotReceiveChannel;
    }
  }
  // ICE candidates management
  var state = "not sent";
  function handleIceCandidate(event) {
    // console.log('handleIceCandidate event: ', event);
    if (event.candidate) {
      sendMessage({
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate});
    } else {
      console.log('End of candidates.');
    }
  }
  // 2. Client-->Server
  // Send message to the other peer via the signaling server
  function sendMessage(message){
    // console.log('Sending message: ');
    Meteor.call('sendMessage', Meteor.user().username, remoteUsername, message,
      function(error, result) {
        // console.log(result);
      });
  }

  // Remote stream handlers...
  function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    var remoteVideo = document.querySelector('#remoteVideo');
    attachMediaStream(remoteVideo, event.stream);
    console.log('Remote stream attached!!.');
    remoteStream = event.stream;
  }
  function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
  }

  // Create Offer
  function doCall() {
    console.log('Creating Offer...');
    pc.createOffer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
  }
  // Signaling error handler
  function onSignalingError(error) {
    console.log('Failed to create signaling message : ' + error);
  }
  // Create Answer
  function doAnswer() { 
      console.log("doAnswer() : " + pc.iceGatheringState + ", " + pc.iceConnectionState + ", " + pc.signalingState);
           //pc.onsignalingstatechange = function(e) {
        //if (e.currentTarget.iceGatheringState === "new")   
        pc.createAnswer(setLocalAndSendMessage, onSignalingError, sdpConstraints);
      //}
  }
  // Success handler for both createOffer()
  // and createAnswer()
  function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    sendMessage(sessionDescription);
  }

  // Clean-up functions...
  function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
    onHangupCallback();
  }
  function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    onRemoteHangupCallback();
    isInitiator = false;
  }
  function stop() {
    isStarted = false;
    state = "not sent";
    //isChannelReady = false;
    // isInitiator = false;
    if (pc) pc.close();
    pc = null;
    $('#' + localVideoId).attr('src', null);
  }

  /* DATA CHANNEL MANAGEMENT */
  this.sendData = function(data, callback) {
    sendDataViaDataChannel(data);
    callback();
  }

  this.onDataChannelReady = function(callback) {
    onDataChannelReadyCallback = callback;
  }

  function sendDataViaDataChannel(data) {
    if(isInitiator) sendChannel.send(data);
    else receiveChannel.send(data);
    trace('Sent data: ' + data);
  }

  function gotReceiveChannel(event) {
    trace('Receive Channel Callback');
    receiveChannel = event.channel;
    receiveChannel.onmessage = handleMessage;
    receiveChannel.onopen = handleReceiveChannelStateChange;
    receiveChannel.onclose = handleReceiveChannelStateChange;
    receiveChannel.onerror = function(e){console.log("DataChannel ERROR!!!" + e)};
  }
  function handleMessage(event) {
    trace('Received message: ' + event.data);
    receiveTextarea.value += event.data + '\n';
  }
  function handleSendChannelStateChange() {
    var readyState = sendChannel.readyState;
    trace('Send channel state is: ' + readyState);
    // If channel ready, enable user's input
    if (readyState == "open") {
      onDataChannelReadyCallback();
    } else {
      // hangup() will take care of it
    }
  }
  function handleReceiveChannelStateChange() {
    var readyState = receiveChannel.readyState;
    trace('Receive channel state is: ' + readyState);
    // If channel ready, enable user's input
    if (readyState == "open") {
        onDataChannelReadyCallback();
    } else {
        // hangup() will take care of it
    }
  }

  /** DEBUG FUNCTION - TO REMOVE WHEN WEBRTC TASK COMPLETED **/

  this.getDataStatus = function() {
    if (sendChannel)
      return sendChannel.readyState;
    return receiveChannel.readyState;
  }
  this.getReceiveChannel = function() {
    return receiveChannel;
  }

  this.getPeerConnection = function() {
    return pc;
  }
}