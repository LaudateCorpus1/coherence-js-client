#!/usr/bin/env bash

# Copyright (c) 2000, 2020, Oracle and/or its affiliates.
#
# Licensed under the Universal Permissive License v 1.0 as shown at
# http://oss.oracle.com/licenses/upl.

set -e

declare -r ROOT="${PWD}"
declare -r CONTAINER_NAME="coherence-js-test-container"
declare -r IMAGE_NAME="oraclecoherence/coherence-ce:20.12-SNAPSHOT"

function coh-up() {
    declare -r CONTAINER_ID=$(docker ps -a -q -f name="${CONTAINER_NAME}")
    if [[ -n "${CONTAINER_ID}" ]]; then
        docker start "${CONTAINER_ID}"
    else
        docker run -d -p 1408:1408 -p 5005:5005 --name "${CONTAINER_NAME}" -v \
            "${ROOT}"/etc:/args "${IMAGE_NAME}"
    fi
}

function coh-down() {
    declare -r CONTAINER_ID=$(docker ps -q -f name="${CONTAINER_NAME}")
    if [[ -n "${CONTAINER_ID}" ]]; then
        docker stop "${CONTAINER_ID}"
    fi
}

function coh-clean() {
    coh-down
    declare -r CONTAINER_ID=$(docker ps -a -q -f name="${CONTAINER_NAME}")
    if [[ -n "${CONTAINER_ID}" ]]; then
        docker rm "${CONTAINER_ID}"
    fi
}

while getopts "udc" OPTION; do
    case "${OPTION}" in
        u)
            coh-up
            ;;
        d)
            coh-down
            ;;
        c)
            coh-clean
            ;;
        ?)
            echo "Usage: $(basename "$0") [-u] [-d]"
            ;;
    esac
done