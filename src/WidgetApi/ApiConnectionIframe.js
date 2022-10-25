import {WidgetApi as MatrixWidgetApi} from "matrix-widget-api/lib/WidgetApi"
import AbstractApiConnection from "./ApiConnection";

class ApiConnectionIframe extends AbstractApiConnection{
    widgetId = 'bldrs-share'
    matrixWidgetApi = null

    constructor() {
        super();
        this.matrixWidgetApi = new MatrixWidgetApi(this.widgetId)
        this.matrixWidgetApi.requestCapabilities([])
    }

    on(eventName, callable) {
        this.matrixWidgetApi.on(
            eventName,
            (event) => {
                event.preventDefault();
                let response = callable(event.detail.data)
                this.matrixWidgetApi.transport.reply(event.detail, response)
            }
        )
    }

    start() {
        this.matrixWidgetApi.start()
    }

    stop() {
        this.matrixWidgetApi.stop()
    }
}

export default ApiConnectionIframe
