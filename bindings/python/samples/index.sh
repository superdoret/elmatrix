#!/bin/sh
while true
do
    action=$((1 + $RANDOM % 8))
    echo $action

    case $action in
        1)
            sudo python3 positive-phrases.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30
        ;;
        2)
            sudo python3 text.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30
        ;;
        3)
            sudo python3 text.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --show-clock=True --led-brightness 30
        ;;
        4)
            sudo python3 weather.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30
        ;;
        5)
            sudo python3 commands.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30
        ;;
        6)
            sudo python3 images.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30
        ;;
        7)
            sudo python3 tetris.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30
        ;;
        8)
            sudo python3 weather.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30 --city Barcelona
        ;;
        *)
            sudo python3 positive-phrases.py --led-cols=64 --led-gpio-mapping=adafruit-hat --led-slowdown-gpio=4 --led-brightness 30
        ;;
    esac
    sleep 2
done
