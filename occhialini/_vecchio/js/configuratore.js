// configuratore.js – il visualizzatore 3D della sezione "In mostra"

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 1. prendiamo il div del visore e togliamo la scritta segnaposto
const visore = document.getElementById('visore');
visore.querySelector('.visore-segnaposto').remove();

// 2. la scena: il "palcoscenico" dove mettiamo gli oggetti
const scena = new THREE.Scene();

// 3. la camera: il nostro punto di vista
const camera = new THREE.PerspectiveCamera(45, visore.clientWidth / visore.clientHeight, 0.1, 100);
camera.position.set(3, 2, 4);
camera.lookAt(0, 0, 0);

// 4. il renderer: disegna la scena dentro un <canvas> nel visore
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(visore.clientWidth, visore.clientHeight);
renderer.shadowMap.enabled = true;              // accendiamo le ombre
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // ombre con il bordo morbido
visore.appendChild(renderer.domElement);

// 4b. l'ambiente: una stanza "finta" che si riflette sull'oggetto quando è lucido
const pmrem = new THREE.PMREMGenerator(renderer);
scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// 5. le luci: senza luce il materiale resterebbe nero
scena.add(new THREE.AmbientLight(0xffffff, 0.3));
const luce = new THREE.DirectionalLight(0xffffff, 1.5);
luce.position.set(3, 6, 4);
luce.castShadow = true;                 // questa luce fa ombra
luce.shadow.mapSize.set(2048, 2048);    // ombra più definita
luce.shadow.camera.left = -4;           // la zona in cui l'ombra viene calcolata
luce.shadow.camera.right = 4;
luce.shadow.camera.top = 4;
luce.shadow.camera.bottom = -4;
luce.shadow.radius = 4;                 // quanto è sfumato il bordo dell'ombra
scena.add(luce);

// 5b. il pavimento: invisibile, si vede solo l'ombra che ci cade sopra
const pavimento = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.2 })
);
pavimento.rotation.x = -Math.PI / 2;    // lo giriamo per farlo stare in orizzontale
pavimento.position.y = -1.3;            // un po' sotto l'oggetto (lo sistemiamo quando il modello è caricato)
pavimento.receiveShadow = true;         // ci si può posare sopra un'ombra
scena.add(pavimento);

// 6. l'oggetto: carichiamo il modello 3D degli occhiali dal file occhialis.glb
// "oggetto" è un contenitore vuoto: ci mettiamo dentro il modello appena è pronto,
// così possiamo farlo ruotare e cambiargli misura anche prima che sia caricato
const oggetto = new THREE.Group();
scena.add(oggetto);

// le parti del modello hanno questi nomi (li ha dati chi ha fatto il modello 3D)
const nomiParti = ['struttura', 'aste', 'lenti', 'gomma', 'ferramenta'];

// qui teniamo i materiali del modello: per nome della parte (per il colore) e quelli che cambiano finitura
const materialiPerParte = {};
const materialiFinitura = [];

// dato un pezzo del modello, risaliamo ai "genitori" finché troviamo il nome della sua parte
function trovaParte(pezzo) {
    while (pezzo) {
        if (nomiParti.includes(pezzo.name)) {
            return pezzo.name;
        }
        pezzo = pezzo.parent;
    }
    return null;
}

// la finitura scelta all'inizio (quella con la classe "selected")
let ruvidezzaScelta = Number(document.querySelector('.finitura.selected').dataset.ruvidezza);

const loader = new GLTFLoader();
loader.load('models/occhialis.glb', function(gltf) {
    const modello = gltf.scene;

    // centriamo il modello e lo portiamo a una grandezza adatta al visore
    const box = new THREE.Box3().setFromObject(modello);
    const dimensioni = box.getSize(new THREE.Vector3());
    const centro = box.getCenter(new THREE.Vector3());
    const s = 2.4 / Math.max(dimensioni.x, dimensioni.y, dimensioni.z);
    modello.scale.setScalar(s);
    modello.position.set(-centro.x * s, -centro.y * s, -centro.z * s);

    // il pavimento va appena sotto l'oggetto (anche quando è nella misura più grande)
    pavimento.position.y = -(dimensioni.y * s / 2) * 1.2 - 0.05;

    // per ogni pezzo del modello: ombre accese e materiali messi da parte
    modello.traverse(function(parte) {
        if (parte.isMesh) {
            parte.castShadow = true;
            parte.receiveShadow = true;

            // nel file alcune parti usano lo stesso materiale: facciamo una copia per ogni pezzo,
            // così colorando le aste non si colorano anche gli altri pezzi
            parte.material = parte.material.clone();

            const nome = trovaParte(parte);
            if (nome) {
                if (!materialiPerParte[nome]) {
                    materialiPerParte[nome] = [];
                }
                materialiPerParte[nome].push(parte.material);
            }

            // le lenti restano sempre trasparenti e lucide: la finitura non le tocca
            if (nome !== 'lenti') {
                materialiFinitura.push(parte.material);
            }
        }
    });

    oggetto.add(modello);

    // applichiamo subito i colori e la finitura già selezionati
    document.querySelectorAll('.campioni[data-parti]').forEach(function(gruppo) {
        const scelto = gruppo.querySelector('.campione.selected');
        aggiornaColore(gruppo.dataset.parti, scelto.dataset.color);
    });
    aggiornaFinitura(ruvidezzaScelta);
});

// parti è un testo come "struttura" o "aste,gomma": lo dividiamo e coloriamo ogni parte
function aggiornaColore(parti, colore) {
    parti.split(',').forEach(function(nome) {
        const materiali = materialiPerParte[nome] || [];
        materiali.forEach(function(m) {
            m.color.set(colore);
        });
    });
}

function aggiornaFinitura(ruvidezza) {
    ruvidezzaScelta = ruvidezza;
    materialiFinitura.forEach(function(m) {
        m.roughness = ruvidezza;
    });
}

// 6b. i controlli col mouse: trascina per girare intorno, rotellina per lo zoom
const controlli = new OrbitControls(camera, renderer.domElement);
controlli.enableDamping = true;   // il movimento rallenta dolcemente quando lasci il mouse
controlli.enablePan = false;      // niente spostamento laterale, l'oggetto resta al centro
controlli.minDistance = 0.9;      // quanto ci si può avvicinare (poco, così l'animazione può arrivare vicinissima)
controlli.maxDistance = 10;       // quanto ci si può allontanare

// 6c. le visuali: la camera si sposta dolcemente verso il punto scelto
// usiamo coordinate "sferiche" (distanza + due angoli): così la camera gira intorno
// all'oggetto invece di passarci attraverso
let destinazione = null;   // la visuale verso cui stiamo andando (null = nessuna)

function muoviVersoVisuale() {
    if (destinazione === null) {
        return;
    }
    // la posizione della camera misurata dal punto che sta guardando (controlli.target)
    const distanza = camera.position.clone().sub(controlli.target);
    const attuale = new THREE.Spherical().setFromVector3(distanza);

    // il punto guardato torna piano piano al centro (dopo l'animazione potrebbe essere spostato)
    controlli.target.multiplyScalar(0.92);

    // facciamo girare l'angolo orizzontale dalla parte più corta
    let differenzaTheta = destinazione.theta - attuale.theta;
    if (differenzaTheta > Math.PI) differenzaTheta -= Math.PI * 2;
    if (differenzaTheta < -Math.PI) differenzaTheta += Math.PI * 2;

    // ad ogni fotogramma facciamo l'8% della strada che manca
    attuale.radius += (destinazione.radius - attuale.radius) * 0.08;
    attuale.phi += (destinazione.phi - attuale.phi) * 0.08;
    attuale.theta += differenzaTheta * 0.08;
    camera.position.setFromSpherical(attuale).add(controlli.target);
    camera.lookAt(controlli.target);

    // quando siamo praticamente arrivati, ci fermiamo
    if (Math.abs(destinazione.radius - attuale.radius) < 0.01 &&
        Math.abs(destinazione.phi - attuale.phi) < 0.001 &&
        Math.abs(differenzaTheta) < 0.001 &&
        controlli.target.length() < 0.001) {
        controlli.target.set(0, 0, 0);
        destinazione = null;
    }
}

const visuali = document.querySelectorAll('.visuale');

visuali.forEach(function(visuale) {
    visuale.addEventListener('click', function() {
        // data-posizione è un testo come "3,2,4": lo trasformiamo in un punto 3D
        const xyz = visuale.dataset.posizione.split(',').map(Number);
        destinazione = new THREE.Spherical().setFromVector3(new THREE.Vector3(xyz[0], xyz[1], xyz[2]));
        fermaAnimazione();

        // spostiamo la classe "selected" sul bottone cliccato
        visuali.forEach(function(v) {
            v.classList.remove('selected');
        });
        visuale.classList.add('selected');
    });
});

// se trascini l'oggetto col mouse, la visuale scelta si interrompe
controlli.addEventListener('start', function() {
    destinazione = null;
    visuali.forEach(function(v) {
        v.classList.remove('selected');
    });
});

// 6d. l'animazione col pulsante: sopra vicino → giù fino a sotto, vicinissima → 5 secondi ferma → sopra dalla parte opposta
// ogni "tappa" dice: quale punto guardare (centro), quanto stare lontano (raggio),
// quanto in alto o in basso (phi: 0 = sopra, PI = sotto) e da che lato (theta)
// "durata" è quanti secondi servono per arrivare a quella tappa dalla precedente
const bottoneAnimazione = document.querySelector('.animazione');
let tappe = null;           // l'elenco delle tappe (null = animazione ferma)
let inizioAnimazione = 0;   // il momento in cui è partita

// tra due numeri, il valore a metà strada secondo t (0 = primo, 1 = secondo)
function tra(a, b, t) {
    return a + (b - a) * t;
}

function avviaAnimazione() {
    destinazione = null;                 // fermiamo un'eventuale visuale in corso
    controlli.enabled = false;           // durante l'animazione il mouse non muove la camera
    visuali.forEach(function(v) {
        v.classList.remove('selected');
    });
    bottoneAnimazione.classList.add('selected');
    bottoneAnimazione.textContent = 'Animazione in corso…';

    // k: se l'oggetto è Mini o Grande, avviciniamo o allontaniamo tutto in proporzione
    const k = oggetto.scale.x;
    const centroOggetto = new THREE.Vector3(0, 0, 0);   // gli occhiali sono già al centro

    // la tappa di partenza è dove si trova adesso la camera
    const partenza = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controlli.target));
    const lato = partenza.theta;

    tappe = [
        { durata: 0,   centro: controlli.target.clone(), raggio: partenza.radius, phi: partenza.phi, theta: lato },
        // 1) sopra l'oggetto, da vicino
        { durata: 2,   centro: centroOggetto,            raggio: 1.5 * k,         phi: 0.6,          theta: lato },
        // 2) scende girando intorno fino a sotto, vicinissima
        { durata: 6,   centro: centroOggetto,            raggio: 1.0 * k,         phi: 2.85,         theta: lato + Math.PI / 2 },
        // 3) resta ferma lì sotto per 5 secondi
        { durata: 5,   centro: centroOggetto,            raggio: 1.0 * k,         phi: 2.85,         theta: lato + Math.PI / 2 },
        // 4) risale dalla parte opposta, sopra l'oggetto
        { durata: 6,   centro: centroOggetto,            raggio: 1.5 * k,         phi: 0.6,          theta: lato + Math.PI }
    ];
    inizioAnimazione = performance.now();
}

function fermaAnimazione() {
    tappe = null;
    controlli.enabled = true;
    bottoneAnimazione.classList.remove('selected');
    bottoneAnimazione.textContent = 'Avvia animazione';
}

// ad ogni fotogramma: troviamo tra quali due tappe siamo e mettiamo la camera a metà strada
function muoviAnimazione() {
    let secondi = (performance.now() - inizioAnimazione) / 1000;

    for (let i = 1; i < tappe.length; i++) {
        const prima = tappe[i - 1];
        const dopo = tappe[i];
        if (secondi <= dopo.durata || i === tappe.length - 1) {
            let t = Math.min(secondi / dopo.durata, 1);
            t = t * t * (3 - 2 * t);     // parte piano, accelera e rallenta alla fine

            controlli.target.lerpVectors(prima.centro, dopo.centro, t);
            const posizione = new THREE.Spherical(
                tra(prima.raggio, dopo.raggio, t),
                tra(prima.phi, dopo.phi, t),
                tra(prima.theta, dopo.theta, t)
            );
            camera.position.setFromSpherical(posizione).add(controlli.target);
            camera.lookAt(controlli.target);

            // finita l'ultima tappa, ridiamo la camera al mouse
            if (i === tappe.length - 1 && t === 1) {
                fermaAnimazione();
            }
            return;
        }
        secondi -= dopo.durata;
    }
}

bottoneAnimazione.addEventListener('click', function() {
    // se è già in corso, il pulsante la ferma; altrimenti la fa partire
    if (tappe === null) {
        avviaAnimazione();
    } else {
        fermaAnimazione();
    }
});

// 7. l'animazione: ad ogni fotogramma l'oggetto ruota un po' e ridisegniamo
function anima() {
    oggetto.rotation.y += 0.01;
    if (tappe !== null) {
        muoviAnimazione();            // l'animazione col pulsante muove la camera da sola
    } else {
        muoviVersoVisuale();          // se hai scelto una visuale, la camera ci scivola piano piano
        controlli.update();           // serve per l'effetto "enableDamping"
    }
    renderer.render(scena, camera);
}
renderer.setAnimationLoop(anima);

// 8. se la finestra cambia misura, adattiamo camera e canvas al visore
window.addEventListener('resize', function() {
    camera.aspect = visore.clientWidth / visore.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(visore.clientWidth, visore.clientHeight);
});

// diventa true solo mentre un accostamento sta cambiando i colori dei pannelli
let applicandoAccostamento = false;

// 9. i pannelli del colore: ogni pannello colora le parti scritte nel suo data-parti
document.querySelectorAll('.campioni[data-parti]').forEach(function(gruppo) {
    const campioni = gruppo.querySelectorAll('.campione');
    const valoreColore = gruppo.closest('.opzione').querySelector('.opzione-valore');

    campioni.forEach(function(campione) {
        campione.addEventListener('click', function() {
            // leggiamo le etichette data-color e data-nome del bottone cliccato
            const colore = campione.dataset.color;
            const nome = campione.dataset.nome;

            // cambiamo il colore solo delle parti di questo pannello
            aggiornaColore(gruppo.dataset.parti, colore);

            // scriviamo il nome del colore di fianco al titolo del pannello
            valoreColore.textContent = nome;

            // spostiamo la classe "selected" sul bottone cliccato (solo in questo pannello)
            campioni.forEach(function(c) {
                c.classList.remove('selected');
            });
            campione.classList.add('selected');

            // se il colore l'hai scelto tu a mano, nessun accostamento è più attivo
            if (!applicandoAccostamento) {
                togliAccostamento();
            }
        });
    });
});

// 9b. gli accostamenti: un clic sceglie in un colpo solo un colore per ogni pannello
const accostamenti = document.querySelectorAll('.accostamento');
const valoreAccostamento = document.querySelector('.accostamenti').closest('.opzione').querySelector('.opzione-valore');
const gruppiColore = document.querySelectorAll('.campioni[data-parti]');

function togliAccostamento() {
    accostamenti.forEach(function(a) {
        a.classList.remove('selected');
    });
    valoreAccostamento.textContent = 'Personalizzato';
}

accostamenti.forEach(function(accostamento) {
    accostamento.addEventListener('click', function() {
        // data-colori è un testo come "Rosso corallo|Arancio|...": un nome per ogni pannello
        const nomiColori = accostamento.dataset.colori.split('|');

        // per ogni pannello "clicchiamo" noi il campione con quel nome
        applicandoAccostamento = true;
        gruppiColore.forEach(function(gruppo, i) {
            const campione = gruppo.querySelector('.campione[data-nome="' + nomiColori[i] + '"]');
            if (campione) {
                campione.click();
            }
        });
        applicandoAccostamento = false;

        // scriviamo il nome dell'accostamento e lo segniamo come scelto
        togliAccostamento();
        valoreAccostamento.textContent = accostamento.dataset.nome;
        accostamento.classList.add('selected');
    });
});

// 10. i bottoni della misura: quando ne clicchi uno, l'oggetto cambia grandezza
const misure = document.querySelectorAll('.misura');
const valoreMisura = document.querySelector('.misure').closest('.opzione').querySelector('.opzione-valore');

misure.forEach(function(misura) {
    misura.addEventListener('click', function() {
        // data-scala dice quanto ingrandire l'oggetto rispetto alla Classic (1 = 50 cm)
        const scala = Number(misura.dataset.scala);

        // cambiamo la grandezza dell'oggetto in tutte e tre le direzioni
        oggetto.scale.set(scala, scala, scala);

        // scriviamo la misura scelta di fianco al titolo "Misura"
        valoreMisura.textContent = misura.dataset.nome;

        // spostiamo la classe "selected" sul bottone cliccato
        misure.forEach(function(m) {
            m.classList.remove('selected');
        });
        misura.classList.add('selected');
    });
});

// 11. la finitura: opaco o lucido, cambiando quanto è ruvida la superficie
const finiture = document.querySelectorAll('.finitura');
const valoreFinitura = document.querySelector('.finiture').closest('.opzione').querySelector('.opzione-valore');

finiture.forEach(function(finitura) {
    finitura.addEventListener('click', function() {
        // data-ruvidezza: 0.9 = opaco (la luce si sparge), 0.15 = lucido (si vedono i riflessi)
        aggiornaFinitura(Number(finitura.dataset.ruvidezza));

        // scriviamo la finitura scelta di fianco al titolo "Finitura"
        valoreFinitura.textContent = finitura.dataset.nome;

        // spostiamo la classe "selected" sul bottone cliccato
        finiture.forEach(function(f) {
            f.classList.remove('selected');
        });
        finitura.classList.add('selected');
    });
});
