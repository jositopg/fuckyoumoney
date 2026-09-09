-- Bandas de mezcla: no hay un % mágico. Landlord vs cartera financiera.
-- El ladrillo por encima de banda no implica vender si el shock se cubre.

INSERT INTO public.ai_guide (sort, topic, content) VALUES
(6, 'mix_bands',
 $g$Mezcla objetivo: bandas, no un porcentaje único.

Cómo elegir perfil:
- landlord = el alquiler es el oficio (valor de alquiler ≥ 35% del patrimonio, o ≥ 3 inmuebles en renta).
- financial = el resto (casa + fondos).

Bandas sobre el total de activos:
- landlord: ALQUILER (no la casa) 50–70%, fondos 20–35%.
- financial: fondos 60–85%, ladrillo 0–25% (vivienda).
- Uso propio (casa, solar, bodega, garaje) se muestra aparte: no entra en la banda de renta y no se vende para “equilibrar”.
- Colchón = N meses de gasto, NUNCA un % del patrimonio. En un neto grande el colchón es pequeño en %.
- parked (reforma, juicio…) no entra en la banda: se queda.
- pensiones / coches = resto, se quedan.

Leer diagnosis.mix.target:
- brickOverEur = ladrillo por encima del techo de banda.
- fundsShortEur = fondos que faltan para el suelo de banda.
- closableNow = idle que se puede pasar a fondos hoy.
- afterDeploy = cómo queda la foto si mueves el idle, sin vender pisos.

Regla (no la tuerzas):
1. Ladrillo alto ≠ vender. Test de venta = diagnosis.mix.stance = divest_brick (el efectivo no aguanta un parón). Candidatos = vacíos.
2. Si stance = rebalance_with_cash: el idle a fondos. No compres más pisos. La banda se entra en años (o no se entra); no se entra liquidando el oficio.
3. No recomiendes un 60/40 de manual. Ese template asume patrimonio líquido, no 20 fincas.
$g$)
ON CONFLICT (sort) DO UPDATE SET topic = EXCLUDED.topic, content = EXCLUDED.content;
