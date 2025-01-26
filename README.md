# nostr-embed

`nostr-embed` is a simple way to embed a Nostr Note into an existing website, blog, news article, or any other web content without relying on third-party embedding services.

## Features

- **Easy Integration**: Embed Nostr Notes by adding just two lines of code.
- **No Third-Party Dependencies**: Avoid reliance on external embedding services.

## Usage

Include the `nostr-embed.js` script and use the `<nostr-embed>` custom element in your HTML code:

### Using a CDN
```html
<script src="https://cdn.jsdelivr.net/gh/aidik/nostr-embed/dist/nostr-embed.min.js"></script>
<nostr-embed note-id="Note ID in hex"></nostr-embed>
```

### Hosting nostr-embed locally
```html
<script src="/local/path/to/nostr-embed.min.js"></script>
<nostr-embed note-id="Note ID in hex"></nostr-embed>
```

- **`note-id`**: Replace `"Note ID in hex"` with the hexadecimal ID of the Nostr Note you wish to embed.


## Development

To work on `nostr-embed`, follow these steps:

1. **Clone the Repository**

2. **Navigate to the nostr-embed Project Directory**

   ```bash
   cd nostr-embed
   ```

3. **Install Dependencies**

   Install the necessary dependencies:

   ```bash
   npm install
   ```

4. **Build Dev**

   Dev build generates `nostr-embed.js` file:

   ```bash
   npm run dev
   ```

   After building dev chnages will be monitored and the `nostr-embed.js` file will be available in the `public` directory.

5. **Build Build**

   Build the project to generate the `nostr-embed.min.js` file:

   ```bash
   npm run build
   ```

   After building, the `nostr-embed.min.js` file will be available in the `dist` directory.

## Thank you

I want to thank to [![dtonon](https://avatars.githubusercontent.com/u/89577423?s=24 "dtonon") **dtonon**](https://github.com/dtonon/) -- I spend a long time looking at [Oracolo](https://github.com/dtonon/oracolo/).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.