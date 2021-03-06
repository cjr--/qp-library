define(module, function(exports, require) {

  var slice = Array.prototype.slice;
  var fs = require('fs');
  var os = require('os');
  var util = require('util');
  var path = require('path');
  var qp = require('qp-utility');

  function make_directory(directory, mode) {
    directory = path.resolve(directory);
    if (typeof mode === 'undefined') {
      mode = 0777 & (~process.umask());
    }
    try {
      if (!fs.statSync(directory).isDirectory()) {
        throw new Error(directory + ' exists and is not a directory');
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        make_directory(path.dirname(directory), mode);
        fs.mkdirSync(directory, mode);
      } else {
        throw e;
      }
    }
  }

  function delete_directory(directory, options) {
    options = options || {};
    if (fs.existsSync(directory)) {
      fs.readdirSync(directory).forEach(function(node) {
        var item = path.join(directory, node);
        if (fs.lstatSync(item).isDirectory()) {
          delete_directory(item);
        } else {
          fs.unlinkSync(item);
        }
      });
      if (!options.children) {
        fs.rmdirSync(directory);
      }
    }
  }

  function delete_files(directory) {
    if (fs.existsSync(directory)) {
      fs.readdirSync(directory).forEach(function(node) {
        var item = path.join(directory, node);
        if (fs.lstatSync(item).isFile()) {
          fs.unlinkSync(item);
        }
      });
    }
  }

  function delete_file(file) {
    if (fs.existsSync(file) && fs.lstatSync(file).isFile()) {
      fs.unlinkSync(file);
    }
  }

  qp.module(exports, 'qp-library/fss', {

    stat: function() {
      return fs.statSync(path.join.apply(null, arguments));
    },

    touch: function() {
      var file = path.join.apply(null, arguments);
      if (this.exists(file)) {
        var time = Date.now() / 1000;
        fs.utimesSync(file, time, time);
      } else {
        this.write(file, '');
      }
    },

    modify: function() {
      var file = path.join.apply(null, arguments);
      if (this.exists(file)) {
        var stat = fs.statSync(file);
        var time = (new Date()).getTime();
        fs.utimesSync(file, stat.atime, time);
      } else {
        this.write(file, '');
      }
    },

    exists: function() {
      try {
        return fs.existsSync(path.join.apply(null, arguments));
      } catch (ex) { /* IGNORE ERROR */ }
      return false;
    },

    make_directory: make_directory,
    delete_directory: delete_directory,
    delete_file: delete_file,
    delete_files: delete_files,

    read: function() {
      var data = null;
      try {
        data = fs.readFileSync(path.join.apply(null, arguments), 'utf8');
      } catch(e) { throw e; }
      return data;
    },

    write: function() {
      var args = slice.call(arguments);
      var data = args.pop();
      var file = path.join.apply(null, args);
      var filepath = path.dirname(file);
      try {
        if (!fs.existsSync(filepath)) {
          make_directory(filepath);
        }
        fs.writeFileSync(file, data);
      } catch (e) { throw e; }
      return file;
    },

    clear: function() {
      var args = slice.call(arguments);
      args.push('');
      return this.write.apply(this, args);
    },

    copy: function(source, target) {
      try {
        var data = fs.readFileSync(source);
        var target_dir = path.dirname(target);
        if (!fs.existsSync(target_dir)) {
          make_directory(target_dir);
        }
        fs.writeFileSync(target, data);
        return data.length;
      } catch (e) {
        return null;
      }
    },

    rename: function(file, name) {
      try {
        fs.renameSync(file, path.join(path.dirname(file), name));
      } catch (e) {
        return null;
      }
    },

    append: function() {
      var args = slice.call(arguments);
      var data = args.pop();
      var file = path.join.apply(null, args);
      var filepath = path.dirname(file);
      try {
        if (!fs.existsSync(filepath)) {
          make_directory(filepath);
        }
        fs.appendFileSync(file, data);
      } catch (e) { throw e; }
      return file;
    },

    read_file: function() {
      var args = slice.call(arguments);
      var encoding = args.pop();
      var data = null;
      try {
        data = fs.readFileSync(path.join.apply(null, args), encoding);
      } catch(e) { throw e; }
      return data;
    },

    write_file: function() {
      var args = slice.call(arguments);
      var encoding = args.pop();
      var data = args.pop();
      var file = path.join.apply(null, args);
      var filepath = path.dirname(file);
      try {
        if (!fs.existsSync(filepath)) {
          make_directory(filepath);
        }
        fs.writeFileSync(file, data, encoding);
      } catch (e) { throw e; }
      return file;
    },

    read_json: function() {
      var json = null;
      try {
        json = JSON.parse(fs.readFileSync(path.join.apply(null, arguments), 'utf8'));
      } catch(e) { json = {}; }
      return json;
    },

    write_json: function() {
      var args = slice.call(arguments);
      var o = args.pop();
      this.clear.apply(this, args);
      args.push(JSON.stringify(o, null, '  '));
      this.write.apply(this, args);
    },

    get_directories: function(dir, options) {
      options = options || {};
      var exclude = options.exclude;
      var directories = [];
      try {
        fs.readdirSync(dir).forEach(function(node) {
          if (node[0] !== '.' && (!exclude || exclude.indexOf(node) === -1)) {
            var name = path.join(dir, node);
            var stat = fs.statSync(name);
            if (stat.isDirectory()) {
              directories.push(name);
            }
          }
        }, this);
      } catch(e) { directories = null; }
      return directories;
    },

    get_files: function(dir, options, files) {
      options = options || {};
      files = files || [];
      var exts = options.ext;
      var search = options.file;
      try {
        var dirs = [];
        fs.readdirSync(dir).forEach(function(node) {
          if (node[0] !== '.') {
            var ext = path.extname(node);
            var name = path.join(dir, node);
            var stat = fs.statSync(name);
            if (stat.isFile()) {
              if (
                (!exts && !search) ||
                (exts && ext.length && exts.indexOf(ext) >= 0) ||
                (search && node === search)
              ) {
                files.push(name);
              }
            } else if (stat.isDirectory()) {
              if (options.deep) {
                dirs.push(name);
              }
            }
          }
        }, this);
        if (options.deep && dirs.length) {
          dirs.forEach(function(dir) {
            this.get_files(dir, options, files);
          }, this);
        }
      } catch(e) { if (options.debug) console.log(e); files = null; }
      return files;
    },

    read_files: function(files, options) {
      options = options || {};
      var data = '';
      var new_line = os.EOL + os.EOL;
      files.forEach(function(file) {
        if (fs.lstatSync(file).isFile()) {
          data += os.EOL + '/* ' + file + ' */' + new_line + fs.readFileSync(file, 'utf8');
        }
      });
      return data;
    },

    merge_files: function(files, options) {
      if (options && options.out_file) {
        this.clear(options.out_file);
        var new_line = os.EOL + os.EOL;
        files.forEach(function(file) {
          if (fs.lstatSync(file).isFile()) {
            var data = os.EOL + '/* ' + file + ' */' + new_line + fs.readFileSync(file, 'utf8');
            fs.appendFileSync(options.out_file, data);
          }
        });
      }
    },

    base64_image: function(image, mime) {
      var data = fs.readFileSync(image).toString('base64');
      return util.format('data:%s;base64,%s', mime, data);
    }

  });

});
