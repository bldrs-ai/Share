#!/bin/bash
# yarn install
# yarn cy-build
LOGS_DIR=cypress/e2e/logs
mkdir -p $LOGS_DIR

run_cy_spec() {
    local epic=$1
    local specs=$2
    local log="$LOGS_DIR/$epic.log"
    (
        yarn cy-spec $specs > $log 2> $log.err
        echo -n "$epic "
        tail -4 $log | egrep '(passed|failed)'
    )&
}

echo "Running cypress specs in parallel..."

# Misc
run_cy_spec misc cypress/e2e/appStore,cypress/e2e/hide-feat,cypress/e2e/home,cypress/e2e/ifc-model,cypress/e2e/integration

# Then conventional
for EPIC in create-100 open notes-100 profile-100 versions-100 view-100 ; do
    SPECS="cypress/e2e/$EPIC"
    run_cy_spec $EPIC "$SPECS"
done

wait
echo "All specs finished.  See $LOGS_DIR for output from each spec"
