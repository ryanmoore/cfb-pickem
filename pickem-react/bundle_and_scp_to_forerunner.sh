#!/bin/sh -e
echo "-- Building"
ln -sf .env.prod .env
npm run build
echo "-- Transferring"
tar czvf ./build.tar.gz ./build && scp ./build.tar.gz forerunner:~/
ln -sf .env.dev .env
echo "-- Installing on remote"
ssh forerunner "cd pickem-react-build; ./install.sh"
