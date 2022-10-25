class AbstractApiConnection {

    on(event, callable) {
    }

    start() {
    }

    stop() {
    }

    missingArgumentResponse = function (argumentName) {
        return {
            'error': true,
            'reason': `Missing argument ${argumentName}`
        }
    }
    successfulResponse = function (data) {
        return {
            'error': false,
            ...data
        }
    }
}

export default AbstractApiConnection