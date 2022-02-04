#!/bin/bash

for file in in/*.mid
  do
    basename="${file##*/}"
    node tools/slow-down.js 2 "${file}" "out/${basename}-slow.mid"
  done
