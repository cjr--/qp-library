define(module, function(exports, require) {

  var qp = require('qp-utility');
  var node_url = require('url');
  var qs = require('querystring');
  var mime = require('mime');

  qp.make(exports, {

    ns: 'qp-library/url',

    self: {

      sep: '/',

      split: function() {
        return qp.flatten(qp.arg(arguments).map(function(part) { return part.split(this.sep); }));
      },

      join: function() {
        return this.sep + this.split.apply(this, arguments).join(this.sep);
      },

      parse: node_url.parse,
      format: node_url.format,
      resolve: node_url.resolve

    },

    parsed: null,

    sep: '/',
    is_file: false,
    is_directory: false,
    fullname: '',
    path: '',
    parts: [],
    file: '',
    name: '',
    ext: '',
    params: undefined,
    mime: '',

    init: function(config) {
      if (config.base_url) {
        this.parsed = new URL(config.url, config.base_url);
      } else {
        this.parsed = node_url.parse(config.url);
      }
      var url_path = qp.trim(this.parsed.pathname.toLowerCase(), this.sep);
      var parts = qp.split(url_path, this.sep);
      var file = qp.last(parts) || '';
      if (file.indexOf('.') !== -1) {
        var file_parts = qp.split(file, '.');
        this.is_file = true;
        this.fullname = this.sep + parts.join(this.sep);
        this.parts = parts.slice(0, -1);
        this.path = this.sep + this.parts.join(this.sep) + this.sep;
        this.file = file;
        this.name = file_parts.slice(0, -1).join('.');
        this.ext = file_parts.slice(-1)[0];
      } else {
        this.is_directory = true;
        if (qp.empty(parts) || (parts.length === 1 && parts[0] === '')) {
          this.fullname = this.sep;
        } else {
          this.parts = parts;
          this.fullname = this.sep + parts.join(this.sep) + this.sep;
        }
        this.path = this.fullname;
      }
      this.mime = mime.getType(this.fullname);
    },

    equals: function(test) { return this.fullname === test;  },

    starts: function(test) { return qp.starts(this.fullname, test); },

    ends: function(test) { return qp.ends(this.fullname, test); },

    contains: function(test) { return qp.contains(this.fullname, test); },

    is_root_directory: function() {
      return /^\/[a-zA-Z0-9_-]+\/$/.test(this.fullname);
    },

    set_ext: function(ext) {
      if (this.is_file) {
        return this.self.create({ url: this.path + this.name + '.' + qp.ltrim(ext, '.') });
      }
      return this.self.create({ url: this.fullname });
    },

    set_rootname: function(name) {
      return this.self.create({ url: name + this.sep + this.fullname });
    },

    set_file: function(name, ext) {
      return this.self.create({ url: this.path + name + '.' + qp.ltrim(ext, '.') });
    },

    get_param: function(key) {
      if (this.parsed.searchParams) {
        return this.parsed.searchParams.get(key);
      } else {
        return this.get_params()[key];
      }
    },

    get_params: function() {
      return this.params || (this.params = qs.parse(this.parsed.query));
    }

  });

});
