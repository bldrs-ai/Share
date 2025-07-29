#!/bin/bash
# yarn install
# yarn cy-build

# Set default concurrency if not specified
NUM_PARALLEL=${NUM_PARALLEL:-6}

LOGS_DIR=cypress/e2e/logs
mkdir -p $LOGS_DIR

# Clean up downloads directory to prevent trash errors
rm -rf cypress/downloads

# Semaphore to limit concurrent jobs
SEMAPHORE_FILE="/tmp/cypress_semaphore_$$"
echo $NUM_PARALLEL > $SEMAPHORE_FILE

# Track failed specs for retry
FAILED_SPECS_FILE="/tmp/cypress_failed_specs_$$"
touch $FAILED_SPECS_FILE

# Track final failures for exit code
FINAL_FAILURES_FILE="/tmp/cypress_final_failures_$$"
touch $FINAL_FAILURES_FILE

# Function to acquire semaphore
acquire_semaphore() {
    while true; do
        local current=$(cat $SEMAPHORE_FILE)
        if [ $current -gt 0 ]; then
            echo $((current - 1)) > $SEMAPHORE_FILE
            break
        fi
        sleep 1
    done
}

# Function to release semaphore
release_semaphore() {
    local current=$(cat $SEMAPHORE_FILE)
    echo $((current + 1)) > $SEMAPHORE_FILE
}

# Function to check if spec passed
check_spec_result() {
    local log_file=$1
    if [ -f "$log_file" ]; then
        # Look for Cypress result patterns in the log
        if grep -q "All specs passed!" "$log_file"; then
            return 0  # Success
        elif grep -q "failed" "$log_file" && grep -q "✖" "$log_file"; then
            return 1  # Failure
        fi
    fi
    return 1  # Default to failure if can't determine
}

run_cy_spec() {
    local epic=$1
    local specs=$2
    local port=$3
    local is_retry=$4
    local log="$LOGS_DIR/$epic.log"
    
    # For retries, use a different log file
    if [ "$is_retry" = "true" ]; then
        log="$LOGS_DIR/${epic}_retry.log"
    fi
    
    # Acquire semaphore before starting
    acquire_semaphore
    
    (
        CYPRESS_PORT=$port yarn cy-spec $specs > $log 2> $log.err
        echo -n "$epic"
        if [ "$is_retry" = "true" ]; then
            echo -n " (retry)"
        fi
        echo -n " "
        tail -4 $log | egrep '(passed|failed)'
        
        # Check result and add to failed list if it failed
        if ! check_spec_result "$log"; then
            echo "$epic:$specs:$port" >> $FAILED_SPECS_FILE
            # If this is a retry and it still failed, add to final failures
            if [ "$is_retry" = "true" ]; then
                echo "$epic" >> $FINAL_FAILURES_FILE
            fi
        fi
        
        # Release semaphore after completion
        release_semaphore
    )&
}

echo "Running cypress specs in parallel (max $NUM_PARALLEL concurrent)..."

PORT=8000
EPICS=`ls cypress/e2e | grep -Ev '(parallel.sh|logs)'`
for EPIC in $EPICS ; do
    SPECS="cypress/e2e/$EPIC"
    run_cy_spec $EPIC "$SPECS" $PORT
    PORT=$((PORT + 100))
done

wait

# Check for failed specs and retry them
if [ -s "$FAILED_SPECS_FILE" ]; then
    echo ""
    echo "Retrying failed specs..."
    
    # Read failed specs and retry them
    while IFS=: read -r epic specs port; do
        if [ -n "$epic" ] && [ -n "$specs" ] && [ -n "$port" ]; then
            run_cy_spec "$epic" "$specs" "$port" "true"
        fi
    done < "$FAILED_SPECS_FILE"
    
    wait
fi

# Clean up temporary files
rm -f $SEMAPHORE_FILE $FAILED_SPECS_FILE

echo "All specs finished. See $LOGS_DIR for output from each spec"

# Check for final failures and set exit code
if [ -s "$FINAL_FAILURES_FILE" ]; then
    echo ""
    echo "The following specs failed after retry:"
    cat "$FINAL_FAILURES_FILE"
    rm -f $FINAL_FAILURES_FILE
    exit 1
else
    rm -f $FINAL_FAILURES_FILE
    echo ""
    echo "All specs passed! ✨"
    exit 0
fi
