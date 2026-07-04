// Static server: map /assets/tacchien/tc → public/tc, phục vụ index.html giả lập www.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "../../tacchien/public/tc");
const PREFIX = "/assets/tacchien/tc/";
const PORT = process.env.TC_PORT || 8123;

http
  .createServer((req, res) => {
    const url = req.url.split("?")[0];
    let file;
    if (url.startsWith(PREFIX)) file = path.join(PUB, url.slice(PREFIX.length));
    else if (url === "/" || url === "/tc") file = path.join(HERE, "index.html");
    else file = path.join(HERE, url.replace(/^\//, ""));
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("404 " + file);
        return;
      }
      const type =
        { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[
          path.extname(file)
        ] || "text/plain";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log("tc harness on " + PORT));
