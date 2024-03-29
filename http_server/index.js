define(module, function(exports, require) {

  var http = require('http');
  var https = require('https');
  var fs = require('fs');
  var stream = require('stream');
  var domain = require('domain');
  var useragent = require('useragent');
  var mustache = require('mustache');
  var mime = require('mime');
  var qp = require('qp-utility');
  var fss = require('qp-library/fss');
  var fso = require('qp-library/fso');
  var url = require('qp-library/url');
  var log = require('qp-library/log');

  qp.make(exports, {

    ns: 'qp-library/http_server',

    title: '',
    name: '',
    origin: '',
    port: 80,
    www: '',
    auto: false,
    build: false,
    log: { },
    secure: false,
    certificate_path: '',
    certificate_file: '',
    key_file: '',
    favicon: 'none',
    headers: {},
    cors: {
      preflight: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,POST',
        'Access-Control-Allow-Headers': 'SessionId, Content-Type, Accept, X-Requested-With'
      },
      request: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      }
    },
    templates: {},
    routes: null,

    http_server: null,
    is_closing: false,
    enable_domain: true,
    enable_session_cookie: false,
    session_cookie_secure: false,
    session_cookie_domain: false,
    session_cookie_path: false,
    session_cookie_expires: false,

    mime_types: {
      text: mime.getType('txt'),
      html: mime.getType('html'),
      css: mime.getType('css'),
      js: mime.getType('js'),
      json: mime.getType('json'),
      ico: mime.getType('ico')
    },

    handlers: {

      template: function(send, id, data, headers) {
        var template = this.templates[id];
        if (template) {
          send.data(mustache.render(fss.read(template.path), data), this.mime(template.type), headers);
        }
      },

      text: function(send, msg, headers) {
        send.data(msg, this.mime('text'), headers);
      },

      html: function(send, html, headers) {
        send.data(html, this.mime('html'), headers);
      },

      data: function(send, data, mime, headers) {
        const readStream = new stream.PassThrough();
        send(200, { mime: mime, size: Buffer.byteLength(data) }, readStream.end(data), headers);
      },

      file: function(send, file, headers) {
        if (file.is_file && file.exists) {
          send(200, file, fs.createReadStream(file.fullname), headers);
        } else {
          send(404);
        }
      },

      json: function(send, o, headers) {
        var data = JSON.stringify(o, null, 2);
        send(200, { mime: this.mime('json'), size: Buffer.byteLength(data) }, data, headers);
      },

      redirect: function(send, location, permanent) {
        send(permanent ? 308 : 307, null, null, { 'Location': location });
      },

      error: function(send, error, headers) {
        var data = JSON.stringify(error, null, 2);
        send(500, { mime: this.mime('json'), size: Buffer.byteLength(data) }, data, headers);
      }

    },

    start: function() {
      if (!this.http_server) this.create_server();

      process.on('SIGTERM', function() {
        this.stop(() => {
          log(log.red('SIGTERM'), qp.now('iso'));
          process.exit(0);
        });
      }.bind(this));

      this.http_server.listen(this.port);
      this.on_start();
    },

    stop: function(done) {
      qp.parallel([
        (data, done) => this.http_server.close(done),
        (data, done) => this.on_stop(done)
      ], done || qp.noop);
    },

    add_handler: function(key, handler) {
      this.handlers[key] = handler.bind(this);
    },

    add_route: function(host, ns) {
      var handler = require(ns);
      if (!this.routes) this.routes = {};
      this.routes[host] = handler.create();
    },

    create_server: function() {
      var options = { };
      var http_handler = qp.noop;
      if (this.enable_domain) {
        http_handler = function(req, res) {
          var d = domain.create();
          d.on('error', this.on_error.bind(this, req, res));
          d.add(req);
          d.add(res);
          d.run(this.run_request.bind(this, req, res));
        }.bind(this);
      } else {
        process.on('uncaughtException', this.on_error.bind(this, undefined, undefined));
        http_handler = function(req, res) { this.run_request.call(this, req, res); }.bind(this);
      }
      if (this.secure) {
        options.cert = fss.read(this.certificate_path, this.certificate_file);
        options.key  = fss.read(this.certificate_path, this.key_file);
        this.http_server = https.createServer(options, http_handler);
      } else {
        this.http_server = http.createServer(options, http_handler);
      }
    },

    mime: function(type) {
      return this.mime_types[type] || (this.mime_types[type] = mime.getType(type));
    },

    read_data: function(req, done) {
      var post_data = '';
      req.on('data', function(data) { post_data += data; });
      req.on('end', function() { done.call(this, null, post_data); }.bind(this));
    },

    read_json: function(req, done) {
      var json = '';
      req.on('data', function(data) { json += data; });
      req.on('end', function() { done.call(this, null, JSON.parse(json)); }.bind(this));
    },

    read_agent: function(req) {
      req.ua = useragent.parse(req.headers['user-agent']);
    },

    set_session_cookie: function(res, sid) {
      if (this.enable_session_cookie) {
        var cookie = ['Session-Id=' + sid];
        if (this.session_cookie_expires) {
          var expires_dt = new Date();
          expires_dt.setTime(expires_dt.getTime() + this.session_cookie_expires);
          cookie.push('Expires=' + expires_dt.toUTCString());
        }
        if (this.session_cookie_path) cookie.push('Path=' + this.session_cookie_path);
        if (this.session_cookie_domain) cookie.push('Domain=' + this.session_cookie_domain);
        cookie.push('HttpOnly');
        cookie.push('SameSite=Strict');
        res.setHeader('Set-Cookie', cookie.join('; '));
      }
    },

    ip_address: function(req) {
      var ip_address;
      var forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        ip_address = forwarded.split(',')[0];
      }
      return ip_address || req.connection.remoteAddress;
    },

    user_agent: function(req) { return req.headers['user-agent']; },

    session_id: function(o) {
      if (qp.is(o, 'url')) {
        return o.get_params().sid || '';
      } else if (o.headers['session-id']) {
        return o.headers['session-id'] || '';
      } else if (this.enable_session_cookie) {
        var cookie = o.headers['cookie'] || '';
        var results = cookie.match('Session-Id' + '=(.*?)(;|$)');
        return results ? results[1] : '';
      } else {
        return '';
      }
    },

    status: function(code, include_code) {
      var description = http.STATUS_CODES[code] || '';
      return (include_code ? code : '') + (description ? ' - ' + description : '');
    },

    run_request: function(req, res) {
      var scheme = req.headers['x-scheme'] || 'http';
      var req_url = url.create({ url: req.url, base_url: `${scheme}://${req.headers.host}` });
      var site = this.get_site(req_url.parsed);
      if (this.log.request) this.log_request(req_url, site, req);
      var send = this.send.bind(this, req_url, req, res);
      qp.each(this.handlers, (handler, key) => send[key] = handler.bind(this, send));
      if (req.method === 'GET' && this.favicon === 'none' && req_url.equals('/favicon.ico')) {
        send(200, { mime: this.mime('ico'), size: 0 }, '');
      } else if (this.auto) {
        this.on_auto_request(req.method, req_url, send, req, res, site);
      } else if (this.has_route(site)) {
        this.run_route(req.method, req_url, send, req, res, site);
      } else {
        this.on_request(req.method, req_url, send, req, res, site);
      }
    },

    has_route: function(site) { return this.routes && qp.defined(this.routes[site.host]); },

    run_route: function(method, url, send, req, res, site) {
      this.routes[site.host].on_request(method, url, send, req, res, site);
    },

    get_site: function(url) {
      return {
        name: url.hostname,
        protocol: url.protocol,
        origin: url.origin,
        host: url.host,
        hostname: url.hostname,
        port: url.port
      };
    },

    log_request: function(req_url, site, req) {
      log(log.magenta('REQ    '), log.blue(qp.rpad(req.method, 4)), log.white(req_url.fullname));
    },

    send: function(req_url, req, res, status, stat, data, headers) {
      if (!res.done) {
        res.done = true;
        if (this.log.response) this.log_response(status, req.method, req_url.fullname, req, headers);
        if (arguments.length === 3) {
          res.writeHead(204, this.headers);
          res.end();
        } else if (arguments.length === 4) {
          res.writeHead(status, this.create_headers({ mime: this.mime('text'), size: 0 }));
          res.end();
        } else {
          res.writeHead(status, this.create_headers(stat, headers));
          if (qp.is(data, 'string')) {
            res.write(data);
            res.end();
          // TODO: detect stream.PassThrough objects
          } else if (qp.is(data, 'readstream') || qp.is(data?.pipe, 'function')) {
            data.pipe(res);
          } else {
            res.end();
          }
        }
      }
    },

    log_response: function(status, method, url, req, headers) {
      var status_color = status < 200 ? 'magenta' : status < 300 ? 'green' : status < 400 ? 'yellow' : 'white_red';
      var method_color = status >= 400 ? 'white_red' : 'blue';
      var url_color = status >= 400 ? 'white_red' : 'white';
      var info = '';
      if (status === 307 || status === 308) {
        info = ` -> ${headers.Location}`;
      }
      log(log.magenta('RES    '), log[status_color](status), log[method_color](qp.rpad(method, 4)), log[url_color](url), info);
    },

    create_headers: function(stat, headers) {
      if (!stat) { return qp.assign({}, this.headers, headers); }
      stat.mtime = stat.mtime || qp.now();
      return qp.assign({
        'ETag': JSON.stringify([stat.ino || 'x', stat.size, stat.mtime.getTime()].join('-')),
        'Last-Modified': stat.mtime.toUTCString(),
        'Content-Type': stat.mime,
        'Content-Length': stat.size
      }, this.headers, headers);
    },

    on_request: function(method, url, send) { send(204); },

    on_auto_request: function(method, url, send) {
      if (method === 'GET') {
        if (url.is_file) {
          let file = fso.create({ base: this.www, url: url });
          if (file.is_file && file.exists) {
            send.file(file);
          } else {
            send(404);
          }
        } else if (url.is_directory) {
          let file = fso.create({ base: this.www, path: url.fullname + 'index.html' });
          if (file.is_file && file.exists) {
            send.file(file);
          } else {
            send(404);
          }
        } else {
          send(404);
        }
      } else {
        send(404);
      }
    },

    on_start: function() { },

    on_stop: function(done) { done(); },

    on_error: function(http_request, http_response, error) {
      try {
        this.http_server.close();
        log('Exception:', http_request ? http_request.url : ' ...');
        log(error.stack);
        if (http_response) {
          http_response.statusCode = 500;
          http_response.setHeader('content-type', 'text/plain');
          http_response.end(error.stack);
        }
      } catch (error1) {
        log(error1.stack);
      } finally {
        log('Terminated');
        process.exit(1);
      }
    }

  });

});
