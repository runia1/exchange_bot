#!/bin/bash

# build
# no need to build #alias build:all='npm run build:all'

# deploy
alias deploy:bot='node src/bot-runner.js &> logs/bot.log &'
alias deploy:api='node src/api.js &> logs/api.log &'

# kill
alias kill:bot="kill \$(ps aux | grep node.*bot | grep -v grep | awk '{print \$2}') && ps aux | grep node"
alias kill:api="kill \$(ps aux | grep node.*api | grep -v grep | awk '{print \$2}') && ps aux | grep node"

#tail
alias tail:bot='tail -f logs/bot.log'
alias tail:api='tail -f logs/api.log'