import {WidgetApi as MatrixWidgetApi} from "matrix-widget-api";

class WidgetAPI {

    constructor() {
        if (this.inIframe()) {
            const widgetId = 'bldrs-share';
            const api = new MatrixWidgetApi(widgetId);
            api.requestCapabilities([]);
            api.on("action:ai.bldrs-share.setSelectedElement", (ev) => {
                ev.preventDefault();
                window.loacation = '/share/v/p/index.ifc/89/112/139/154/396'
                api.transport.reply(ev.detail, {});
            });
            api.start();
        }
    }

    inIframe () {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }
}

export default WidgetAPI
