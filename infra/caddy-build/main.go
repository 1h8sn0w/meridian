package main

import (
	caddycmd "github.com/caddyserver/caddy/v2/cmd"

	// Стандартний набір модулів Caddy. Без цього імпорту бінарник запуститься,
	// але не знатиме ні `file_server`, ні `reverse_proxy`, ні `templates` —
	// тобто нічого з того, на чому тримається Caddyfile стека.
	_ "github.com/caddyserver/caddy/v2/modules/standard"
)

func main() {
	caddycmd.Main()
}
