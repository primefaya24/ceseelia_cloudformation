red=`tput setaf 1`
green=`tput setaf 2`
reset=`tput sgr0`

# SAM deploy
echo "${green}------> Deploying SAM template <------${reset}"
sam deploy -t template.yaml --config-env $1 --profile default