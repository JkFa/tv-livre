#!/usr/bin/env bash
# Gera as listas HLS de fixture dos testes E2E (modos Econômico e Rádio) em tests/fixtures/hls/.
#   multi/   mestra com 2 níveis de vídeo (≈400k e ≈150k) e uma variante SÓ DE ÁUDIO (≈48k)
#   simples/ mestra com 2 níveis de vídeo e nenhuma variante só de áudio
# Trechos .seg (MPEG-TS; a extensão .ts faria o tsc lê-los como TypeScript) de 2 s, 6 s no total (uns 100 KB por lista). Precisa de ffmpeg com libx264 e aac.
set -euo pipefail
cd "$(dirname "$0")/../tests/fixtures/hls"
rm -rf multi simples
src=(-f lavfi -i "testsrc2=size=320x180:rate=15" -f lavfi -i "sine=frequency=440:sample_rate=44100" -t 6)
common=(-c:v libx264 -preset veryfast -profile:v baseline -pix_fmt yuv420p -g 30 -keyint_min 30 -sc_threshold 0 -c:a aac
        -f hls -hls_time 2 -hls_playlist_type vod -master_pl_name master.m3u8)

mkdir multi && (cd multi && ffmpeg -loglevel error -y "${src[@]}" \
  -filter_complex "[0:v]split=2[a][b];[a]scale=320:180[v0];[b]scale=160:90[v1]" \
  -map "[v0]" -map "[v1]" -map 1:a -map 1:a -map 1:a \
  -b:v:0 400k -b:v:1 150k -b:a:0 64k -b:a:1 64k -b:a:2 48k "${common[@]}" \
  -var_stream_map "v:0,a:0 v:1,a:1 a:2" -hls_segment_filename "v%v_%d.seg" "v%v.m3u8")

mkdir simples && (cd simples && ffmpeg -loglevel error -y "${src[@]}" \
  -filter_complex "[0:v]split=2[a][b];[a]scale=320:180[v0];[b]scale=160:90[v1]" \
  -map "[v0]" -map "[v1]" -map 1:a -map 1:a \
  -b:v:0 400k -b:v:1 150k -b:a:0 64k -b:a:1 64k "${common[@]}" \
  -var_stream_map "v:0,a:0 v:1,a:1" -hls_segment_filename "v%v_%d.seg" "v%v.m3u8")
echo "fixtures geradas em tests/fixtures/hls"
