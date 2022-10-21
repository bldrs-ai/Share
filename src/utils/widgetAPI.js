import {WidgetApi as MatrixWidgetApi} from "matrix-widget-api";

class WidgetAPI {

    navigation = null

    constructor(navigation) {
        this.navigation = navigation
        if (this.inIframe()) {
            const widgetId = 'bldrs-share';
            const api = new MatrixWidgetApi(widgetId);
            api.requestCapabilities([]);
            api.on("action:ai.bldrs-share.navigate", (ev) => {
                ev.preventDefault();
                navigation(ev.detail.data.to)
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
