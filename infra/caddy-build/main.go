// Той самий Caddy, що в офіційному образі, але зібраний нашим ланцюжком.
//
// Навіщо: офіційний образ `caddy:2-alpine` зібрано в червні 2026-го, і Docker
// Scout бачить у ньому 1 Critical + 13 High — усі в Go-модулях, вкомпільованих
// у бінарник (`stdlib`, `golang.org/x/crypto`, `golang.org/x/net`,
// `google.golang.org/grpc`). `apk upgrade` їх не лікує в принципі: це не пакети
// Alpine. Новішого релізу Caddy немає — 2.11.4 і є останній, — тож єдиний шлях
// закрити їх, не чекаючи на upstream, це зібрати той самий Caddy свіжим Go і з
// піднятими модулями. Версії й обґрунтування — в `infra/web.Dockerfile`.
//
// Це рівно те, що генерує xcaddy без жодного плагіна: точка входу Caddy плюс
// його стандартний набір модулів. Свого коду тут немає й бути не повинно —
// щойно upstream випустить образ зі свіжими модулями, цей файл і збірковий шар
// прибираються одним комітом.
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
