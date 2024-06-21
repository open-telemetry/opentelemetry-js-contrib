var diagch = require("diagnostics_channel");
diagch.subscribe("otel:bundle:load", (message, name) => {
  console.log('minisdk received message:', name, message);
});

