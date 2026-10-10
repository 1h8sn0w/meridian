// Той самий Caddy, що в офіційному образі, але зібраний нашим ланцюжком
// (`infra/web.Dockerfile`, етап `caddy-build`; чому — infra/DECISIONS.md).
//
// Це рівно те, що генерує xcaddy без жодного плагіна: точка входу Caddy плюс
// його стандартний набір модулів. Свого коду тут немає й бути не повинно.
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
