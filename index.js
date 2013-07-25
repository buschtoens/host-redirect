var http = require("http")
  , https = require("https")
  , fs = require("fs")
  , path = require("path");

module.exports = Redirections;

function Redirections(http, https, ssl) {
  if(!(this instanceof Redirections)) return new Redirections(http, https, ssl);
  
  this.paths = {
      http: http
    , https: https
    , ssl: ssl
    };
  this.protocols = ["http", "https"];
  this.servers = {};
  this.protocols.forEach(function(protocol) { this.servers[protocol] = {}; }, this);
}

var protocolRegExp = /^(\w+):(?:\/\/)?/i;
function getProtocol(url) {
  var match = url.match(protocolRegExp);
  if(match instanceof Array) return match[1];
  return null;
}
var hostRegExp = /^(?:\w+:(?:\/\/)?)?(.*)/i;
function getHost(url) {
  var match = url.match(hostRegExp);
  if(match instanceof Array) return match[1];
  return null;
}
function getPath(from, paths) {
  return path.join(paths[from.protocol], from.host);
}

Redirections.prototype.mount = function(protocol, from, to) {
  if(arguments.length === 3 && !~this.protocols.indexOf(protocol))
    return new Error(protocol + " is not in the list of valid protocols: " + this.protocols.join(", "));  
  if(arguments.length === 2)
    to = from, from = protocol, protocol == null;
  
  from = {
      protocol: getProtocol(from) || protocol
    , host:     getHost(from)
    };
  to = {
      protocol: getProtocol(to) || protocol
    , host:     getHost(to)
    };
  from.path = getPath(from, this.paths);
  
  if(!from.protocol && !~this.protocols.indexOf(from.protocol))
    return new Error("No valid protocol specified for " + from);
  if(!to.protocol && !~this.protocols.indexOf(to.protocol))
    return new Error("No valid protocol specified for " + to);
  
  if(from.host in this.servers[from.protocol]) this.dismount(from.protocol, from.host);
  
  return this._mount(from, to);
};

function redirect(to, req, res) {
  res.writeHead(302, { Location: to.protocol + "://" + to.host + req.url });
  res.end();
}
function getPem(pem, paths) {
  var file = path.resolve(path.join(paths.ssl, pem + ".pem"));
  console.log(file);
  if(fs.existsSync(file)) return fs.readFileSync(file);
  return null;
}
Redirections.prototype._mount = function(from, to) {
  switch(from.protocol) {
    case "http":
      from.server = this.servers[from.protocol][from.host] = http.createServer();
      from.server.on("request", redirect.bind(this, to));
      from.server.listen(from.path);
      break;
    case "https":
      from.ssl = {
          key: getPem("key", this.paths)
        , cert: getPem("cert", this.paths)
        , ca: getPem("ca", this.paths)
        };
      from.server = this.servers[from.protocol][from.host] = https.createServer(from.ssl);
      from.server.on("request", redirect.bind(this, to));
      from.server.listen(from.path);
    break;
  }
  return from.server;
};

Redirections.prototype.dismount = function(protocol, host, cb) {
  this.servers[protocol][host].close(cb);
  delete this.servers[protocol][host];
};

Redirections.prototype.http = function(from, to) {
  this.mount("http", from, to);
  return this;
};
Redirections.prototype.https = function(from, to) {
  this.mount("https", from, to);
  return this;
};