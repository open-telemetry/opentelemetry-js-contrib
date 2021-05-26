# OpenTelemetry Browser Extension

This browser extension allows you to inject [OpenTelemetry](https://opentelemetry.io/) instrumentation in any web page. It uses the [Web SDK](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-web) and can export data to Zipkin or an OpenTelemetry Collector.

**Note**: This software is still in an alpha stage, so it has a very reduced feature set and might not work in all circumstances. 
## Supported Environments

* Google Chrome (with [Manifest Version 3](https://developer.chrome.com/docs/extensions/mv3/intro/) support)
* Chromium (with Manifest Version 2)
* Firefox (*unstable*, with Manifest Version 2)

## Installation

### from Download

* Go to [Releases](https://github.com/svrnm/opentelemetry-browser-extension/releases) and download the latest opentelemetry-browser-extension-<version>-<mv2|mv3>.zip from Assets. 
* Unzip that file locally
* Open a new browser window and go to chrome://extensions
* Turn on "Developer Mode"
* Click on "Load unpacked" and the select the folder, where the unzipped extension lives. 
### from Source

Run the following in your shell to download and build the extension from source:

```shell
git clone https://github.com/svrnm/opentelemetry-browser-extension
cd opentelemetry-browser-extension
npm install
npm run compile
```

This will create a so called unpacked extension into the `build/` folder you now can load into your browser: 

* Open a new browser window and go to chrome://extensions
* Turn on "Developer Mode"
* Click on "Load unpacked" and select the `build/mv3` (or `build/mv2`) folder, which contains the extension

If all goes well you should see the extension listed.

## Usage

When visiting a website, click on the extension icon, add an url filter that partially matches the current domain, e.g for `https://www.example.com/example.html` you can set "example" as value. Now, click on `save`, check the developer toolbar for spans being print to the console and being sent to your collector.

## Known Limitations

1. The extension works with [active tab](https://developer.chrome.com/docs/extensions/mv3/manifest/activeTab/) permission, this means that every time you want to use it, you have to click the extension icon at least once for your tab.

2. The use of the zone context manager and the used instrumentation libraries are fixed.

3. Firefox support is unstable, sometimes it works, sometimes not. If you have experience building extensions for firefox, please reach out.

4. The website you are targeting with this extension might have a [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy) (CSP) in place and block the extension from injecting javascript or block the exporters from sending spans to a collector. To work around this limitation, you need another browser extension, that allows you to disable CSP for a website.