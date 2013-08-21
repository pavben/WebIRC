#!/bin/bash
echo "## STEP 1 - Creating a private key" &&
openssl genrsa -out key.pem 1024 &&
echo "## STEP 2 - Creating a certificate signing request" &&
openssl req -new -key key.pem -out csr.pem &&
echo "## STEP 3 - Creating a self-signed certificate" &&
openssl x509 -req -in csr.pem -signkey key.pem -out cert.pem &&
echo "## The following files were created: key.pem, csr.pem, cert.pem" &&
echo "## Edit your config.json and set https.port to enable HTTPS"

