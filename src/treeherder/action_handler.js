class Handler {
  constructor(config, listener) {
    this.listener = listener;

    listener.on('message', (message) => {
      return this.handleAction(message);
    });
  }

  async handleAction(message) {
    let { payload, exchange, routes } = message;
    console.log(payload, exchange, routes);
  }
}

export default async function(config, listener) {
  let instance = new Handler(config, listener);
  await listener.resume();
}
