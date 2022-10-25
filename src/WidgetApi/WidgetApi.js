import ApiConnectionIframe from "./ApiConnectionIframe";
import ApiEventsRegistry from "./ApiEventsRegistry";

class WidgetApi {

    constructor() {
        if (this.detectIframe()) {
            let apiConnection = new ApiConnectionIframe()
            new ApiEventsRegistry(apiConnection)
            apiConnection.start()
        }
    }

    detectIframe () {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }
}

export default WidgetApi
