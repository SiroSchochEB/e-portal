FROM node:22-alpine

WORKDIR /app

COPY index.html .

EXPOSE 80

CMD ["node", "-e", "const http=require('http');const fs=require('fs');const html=fs.readFileSync('index.html');http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html)}).listen(80,'0.0.0.0',()=>console.log('Frontend läuft auf Port 80'))"]