#!/bin/bash

# build
alias build:all='npm run build:all'

# deploy
alias deploy:bot='node build/bot-runner.js &> logs/bot.log &'
alias deploy:api='node build/api.js &> logs/api.log &'

# kill
alias kill:bot="kill \$(ps aux | grep node.*bot | grep -v grep | awk '{print \$2}')"
alias kill:api="kill \$(ps aux | grep node.*api | grep -v grep | awk '{print \$2}')"

#tail
alias tail:bot='tail -f logs/bot.log'
alias tail:api='tail -f logs/api.log'