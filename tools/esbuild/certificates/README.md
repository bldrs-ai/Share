For https serving, generate local pem files and put them in this directory.

# Using mkcert on OSX

```
# Initially

# Install mkcert if you don't have it
brew install mkcert

# One-time system install to allow Start of Authority from OS locally
mkcert -install

# Generate localhost-key.pem and localhost.pem
mkcert localhost 127.0.0.1 ::1
```

Note the actual filenames created, and edit the `./proxy.js` hardcoded filenames to match them exactly.

After this, running our https targets should work fine.
