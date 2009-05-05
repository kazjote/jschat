var Display = {
  add_message: function(text, className) {
    var time_html = '<span class="time">\#{time}</span>'.interpolate({ time: this.dateText() });
    $('messages').insert({ bottom: '<li class="' + className + '">' + time_html + ' ' + text + '</li>' });
    this.scrollMessagesToTop();
  },

  message: function(message) {
    var text = '<span class="user">\#{user}</span> <span class="message">\#{message}</span>';
    text = text.interpolate({ room: message['room'], user: this.truncateName(message['user']), message: this.decorateMessage(message['message']) });
    this.add_message(text, 'message');
  },

  messages: function(messages) {
    $A(messages).each(function(json) {
     this[json['display']](json[json['display']]);
    }.bind(this));
  },

  scrollMessagesToTop: function() {
    $('messages').scrollTop = $('messages').scrollHeight;   
  },

  zeroPad: function(value, length) {
    value = value.toString();
    if (value.length >= length) {
      return value;
    } else {
      return this.zeroPad('0' + value, length);
    }
  },

  dateText: function() {
    var d = new Date;
    return this.zeroPad(d.getHours(), 2) + ':' + this.zeroPad(d.getMinutes(), 2); 
  },

  truncateName: function(text) {
    return text.truncate(10);
  },

  extractURLs: function(text) {
    return text.match(/(http:\/\/[^\s]*)/g);
  },

  decorateMessage: function(text) {
    try {
      var links = this.extractURLs(text);

      if (links) {
        links.each(function(url) {
          if (url.match(/youtube\.com/) && url.match(/watch\?v/)) {
            var youtube_url_id = url.match(/\?v=([^&\s]*)/);
            if (youtube_url_id && youtube_url_id[1]) {
              var youtube_url = 'http://www.youtube.com/v/' + youtube_url_id[1];
              var youtube_html = '<object width="480" height="295"><param name="movie" value="#{movie_url}"></param><param name="allowFullScreen" value="true"></param><param name="allowscriptaccess" value="always"></param><embed src="#{url}" type="application/x-shockwave-flash" allowscriptaccess="always" allowfullscreen="true" width="480" height="295"></embed></object>';
              text = text.replace(url, youtube_html.interpolate({ movie_url: youtube_url, url: youtube_url }));
            } else {
              text = text.replace(url, '<a href="\#{url}">\#{link_name}</a>'.interpolate({ url: url, link_name: url}));
            }
          } else if (url.match(/(jp?g|png|gif)/i)) {
            text = text.replace(url, '<a href="\#{url}" target="_blank"><img class="inline-image" src="\#{image}" /></a>'.interpolate({ url: url, image: url }));
          } else {
            text = text.replace(url, '<a href="\#{url}">\#{link_name}</a>'.interpolate({ url: url, link_name: url}));
          }
        });
      }
    } catch (exception) {
      console.log(exception);
    }
    return text;
  },

  names: function(names) {
    $('names').innerHTML = '';
    names.each(function(name) {
      $('names').insert({ bottom: '<li>' + this.truncateName(name) + '</li>' });
    }.bind(this));
  },

  join: function(join) {
    $('room-name').innerHTML = join['room'];
  },

  join_notice: function(join) {
    $('names').insert({ bottom: '<li>' + this.truncateName(join['user']) + '</li>' });
    this.add_message(join['user'] + ' has joined the room', 'server');
  },

  remove_user: function(name) {
    $$('#names li').each(function(element) { if (element.innerHTML == name) element.remove(); });
  },

  part_notice: function(part) {
    this.remove_user(part['user']);
    this.add_message(part['user'] + ' has left the room', 'server');
  },

  quit_notice: function(quit) {
    this.remove_user(quit['user']);
    this.add_message(quit['user'] + ' has quit', 'server');
  }
};

function displayMessages(text) {
  var json_set = text.evalJSON(true);
  if (json_set.length == 0) {
    return;
  }
  json_set.each(function(json) {
    try {
      Display[json['display']](json[json['display']]);
    } catch (exception) {
    }
  });
}

function updateMessages() {
  new Ajax.Request('/messages', {
    method: 'get',
    parameters: { time: new Date().getTime(), room: currentRoom() },
    onSuccess: function(transport) {
      try {
        displayMessages(transport.responseText);
      } catch (exception) {
      }
    }
  });
}

function adaptSizes() {
  var windowSize = document.viewport.getDimensions();
  $('messages').setStyle({ width: windowSize.width - 220 + 'px' });
  $('messages').setStyle({ height: windowSize.height - 100 + 'px' });
  $('message').setStyle({ width: windowSize.width - 290 + 'px' });
  Display.scrollMessagesToTop();
}

function currentRoom() {
  return window.location.hash;
}

function initDisplay() {
  $('room-name').innerHTML = currentRoom();
  var joiner = new JoinManager();
}

var JoinManager = Class.create({
  initialize: function() {
    this.join();
    this.retries = 0;
    this.poller = new PeriodicalExecuter(this.checkJoined.bindAsEventListener(this), 3);
  },

  join: function() {
    new Ajax.Request('/join', {
      parameters: { room: currentRoom() },
      onSuccess: function() {
        pollUntilJoined();
      }
    });
  },

  joinOK: function(text) {
    var json_set = text.evalJSON(true);
    if (json_set.length == 0) {
      return false;
    }
    return json_set.find(function(json) {
      try {
        if (json['join']) {
          return true;
        }
      } catch (exception) {
      }
    });
  },

  checkJoined: function() {
    new Ajax.Request('/messages', {
      method: 'get',
      parameters: { time: new Date().getTime(), room: currentRoom() },
      onSuccess: function(transport) {
        try {
          if (this.joinOK(transport.responseText)) {
            this.poller.stop();
            this.setupInterface();
          } else {
            this.retries++;
          }

          if (this.retries > 5) {
            alert('Connection error');
            this.poller.stop();
          }
        } catch (exception) {
        }
      }.bind(this)
    });
  },

  setupInterface: function() {
    new Ajax.Request('/lastlog', {
      method: 'get',
      parameters: { time: new Date().getTime(), room: currentRoom() },
      onFailure: function() { alert('Error connecting'); },
      onSuccess: function(transport) {
        new Ajax.Request('/names', {
          method: 'get',
          parameters: { time: new Date().getTime(), room: currentRoom() },
          onSuccess: function() {
            this.poller = new PeriodicalExecuter(updateMessages, 3);
          },
          onFailure: function() { alert('Error connecting'); }
        });
      }
    });
  }
});

document.observe('dom:loaded', function() {
  if ($('room') && window.location.hash) {
    $('room').value = window.location.hash;
  }

  if ($('post_message')) {
    adaptSizes();
    
    Event.observe(window, 'resize', function() {
      adaptSizes();
    });

    setTimeout(initDisplay, 1000);

    $('message').activate();
    $('post_message').observe('submit', function(e) {
      var element = Event.element(e);
      var message = $('message').value;
      $('message').value = '';
      new Ajax.Request('/message', {
        method: 'post',
        parameters: { 'message': message, 'to': currentRoom() },
        onSuccess: function(transport) {
        }
      });

      Event.stop(e);
    });

    Event.observe(window, 'unload', function() {
      new Ajax.Request('/quit');
    });
  }

  if ($('sign-on')) {
    $('name').activate();
  }
});

