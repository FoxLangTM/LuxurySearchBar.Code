<?php
// FoxCorp Engine - Remote Proxy
if (isset($_GET['url'])) {
    $url = $_GET['url'];
    
    // Inicjalizacja CURL - serwer udaje prawdziwą przeglądarkę
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    $response = curl_exec($ch);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);

    // KLUCZ: Usuwamy blokady X-Frame i CSP
    header("Content-Type: $contentType");
    header("X-Frame-Options: ALLOWALL");
    header("Access-Control-Allow-Origin: *");
    header("Content-Security-Policy: upgrade-insecure-requests");

    // Naprawa linków: Zamieniamy relatywne ścieżki na absolutne
    $base = parse_url($url, PHP_URL_SCHEME) . '://' . parse_url($url, PHP_URL_HOST);
    $response = preg_replace('/(src|href)=["\']\/(?!\/)/', "$1=\"$base/", $response);

    echo $response;
}
?>
