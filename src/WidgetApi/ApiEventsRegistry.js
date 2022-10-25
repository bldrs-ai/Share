import useStore from '../store/useStore'

const EVENT_LOAD_MODEL = 'action:ai.bldrs-share.loadModel'
const EVENT_HIGHLIGHT_ELEMENTS = 'action:ai.bldrs-share.highlightElements'

class ApiEventsRegistry {

    apiConnection = null

    constructor(apiConnection) {
        this.apiConnection = apiConnection
        this.registerEventHandlers()
    }

    EVENT_HANDLER_LOAD_MODEL = (data) => {
        if (!('githubIfcPath' in data)) {
            return this.apiConnection.missingArgumentResponse('githubIfcPath')
        }
        useStore.setState({ widgetApiUri: '/share/v/gh/' + data.githubIfcPath })
        return this.apiConnection.successfulResponse()
    }

    EVENT_HANDLER_HIGHLIGHT_ELEMENTS = (data) => {
        if (!('githubIfcPath' in data)) {
            return this.apiConnection.missingArgumentResponse('githubIfcPath')
        }
        if (!('globalIds' in data)) {
            return this.apiConnection.missingArgumentResponse('globalIds')
        }
        if (data.globalIds.length) {
            useStore.setState({ widgetApiUri: '/share/v/gh/' + data.githubIfcPath + '/' + data.globalIds[0] })
        } else {
            useStore.setState({ widgetApiUri: '/share/v/gh/' + data.githubIfcPath })
        }

        return this.apiConnection.successfulResponse()
    }

    EVENT_HANDLER_MAP = {
        [EVENT_LOAD_MODEL]: this.EVENT_HANDLER_LOAD_MODEL,
        [EVENT_HIGHLIGHT_ELEMENTS]: this.EVENT_HANDLER_HIGHLIGHT_ELEMENTS
    }

    registerEventHandlers = () => {
        for (const [eventName, callable] of Object.entries(this.EVENT_HANDLER_MAP)) {
            this.apiConnection.on(eventName, callable)
        }
    }
}

export default ApiEventsRegistry
