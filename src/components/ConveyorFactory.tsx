import { useEffect, useRef } from 'react';

/**
 * ConveyorFactory — Full port of the pixel-art conveyor belt physics engine.
 * Original by masahito / ma5a.com — adapted for React with logo boxes.
 */

const LOGOS = [
    { name: 'Codex', src: '/logos/codex.svg', color: '#10a37f' },
    { name: 'Claude Code', src: '/logos/claudecode.svg', color: '#d4a574' },
    { name: 'OpenClaw', src: '/logos/openclaw.svg', color: '#58a6ff' },
    { name: 'LangChain', src: '/logos/langchain.svg', color: '#2dd4bf' },
];

export default function ConveyorFactory() {
    const containerRef = useRef<HTMLDivElement>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        // Inject scoped styles
        const styleEl = document.createElement('style');
        styleEl.textContent = FACTORY_CSS;
        root.appendChild(styleEl);

        // Build DOM
        const wrapperEl = document.createElement('div');
        wrapperEl.className = 'cf-wrapper';
        root.appendChild(wrapperEl);

        // ─── Helpers ───
        const px = (n: number) => (!isNaN(n) ? n + 'px' : '0');
        const addXy = (a: any, b: any) => { a.x += b.x; a.y += b.y; };
        const subtractXy = (a: any, b: any) => { a.x -= b.x; a.y -= b.y; };
        // ─── World ───
        const world: any = {
            contactElements: [] as any[],
            objects: [] as any[],
            interval: null as any,
            isPaused: false,
            removeObjectTransitions() {
                this.objects.forEach((o: any) => { if (o.defaultClass) o.el.className = o.defaultClass; });
            },
            start() {
                clearInterval(this.interval);
                this.interval = setInterval(() => {
                    if (this.isPaused) { clearInterval(this.interval); return; }
                    this.objects.forEach((o: any) => o.move && o.move());
                    this.contactElements.sort((a: any, b: any) => a.pos.y - b.pos.y);
                }, 100);
            },
            renderFromConfigs(configs: any[]) {
                configs.forEach((config: any) => {
                    try {
                        const ClassMap: any = { box: Box, pneumaticTube: PneumaticTube, conveyorBelt: ConveyorBelt };
                        new ClassMap[config.type](config.props);
                    } catch (_e) { /* skip corrupt */ }
                });
            },
        };

        const wrapperState = {
            el: wrapperEl,
            size: { w: 900, h: 500 },
        };

        // ─── WorldObject ───
        class WorldObject {
            el: HTMLElement;
            pos: any;
            lastPos: any;
            offset: any;
            grabPos: any;
            isGrabbed: boolean;
            isDraggable: boolean;
            group?: any[];
            container?: HTMLElement;
            size?: any;
            base?: any;
            deleted?: boolean;
            zIndex?: number;

            constructor({ pos = { x: 0, y: 0 }, el, offset = { x: 0, y: 0 } }: any) {
                this.el = el;
                this.pos = pos;
                this.lastPos = { x: null, y: null };
                this.offset = offset;
                this.grabPos = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
                this.isGrabbed = false;
                this.isDraggable = false; // disabled in embedded mode
            }
            distanceBetween(el: any) {
                return Math.round(Math.sqrt(Math.pow(this.pos.x - el.x, 2) + Math.pow(this.pos.y - el.y, 2)));
            }
            getNewPosBasedOnTarget = ({ el, maxDistance }: any) => {
                const fullDistance = this.distanceBetween(el);
                if (fullDistance <= 0) return this.pos;
                const d = maxDistance < fullDistance ? maxDistance : fullDistance;
                const remainingD = fullDistance - d;
                return {
                    x: Math.round((remainingD * this.pos.x + d * el.x) / fullDistance),
                    y: Math.round((remainingD * this.pos.y + d * el.y) / fullDistance),
                };
            }
            setPos() {
                const { x, y } = this.pos;
                if (this.lastPos.x === x && this.lastPos.y === y) return;
                this.lastPos = { x, y };
                this.el.style.transform = `translate(${px(this.pos.x)}, ${px(this.pos.y)})`;
            }
            addToWorld() {
                this.setPos();
                (this.container || wrapperEl).appendChild(this.el);
            }
            get corners() {
                const { pos: { x, y }, size: { w, h } } = this as any;
                return { a: x - w, b: x + w, c: y - h, d: y + h };
            }
            isPosWithinArea(pos: any) {
                const { a, b, c, d } = this.corners;
                return pos.x >= a && pos.x <= b && pos.y >= c && pos.y <= d;
            }
            onLetGo = () => {
                this.isGrabbed = false;
                this.grabPos = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
            }
            clampDirection(dir: string, gravObj: any) {
                const { size: { w, h }, pos: { x, y } } = this as any;
                if (dir === 'd' && gravObj.pos.y > y - h / 2) gravObj.pos.y = y;
                else if (dir === 'r' && gravObj.pos.x > x - w / 2) gravObj.pos.x = x;
                else if (dir === 'u' && gravObj.pos.y < y + h / 2) gravObj.pos.y = y;
                else if (dir === 'l' && gravObj.pos.x < x + w / 2) gravObj.pos.x = x;
            }
            delete() {
                this.deleted = true;
                this.el.remove();
                world.contactElements = world.contactElements.filter((el: any) => el !== this);
                world.objects = world.objects.filter((o: any) => o !== this);
                if (this.group) this.group.forEach((member: any) => !member.deleted && member.delete());
            }
        }

        // ─── Surface ───
        class Surface extends WorldObject {
            transitionClass?: string;
            constructor(props: any) {
                super(props);
                world.contactElements.push(this);
            }
            get startX() { return this.pos.x - this.offset.x; }
            get endX() { return this.pos.x + this.size!.w + this.offset.x; }
            get gravObjsInContact() {
                return world.objects.filter((o: any) => o.elInContact === this);
            }
            moveGravObjInContactWithDrag(offset?: any) {
                this.gravObjsInContact.forEach((o: any) => {
                    o.moveGravObjInContactWithDrag?.(offset);
                    o.el.classList.add(this.transitionClass || 'cf-no-transition');
                    subtractXy(o.pos, offset || this.grabPos.a);
                    o.setPos();
                });
            }
            isGravObjInContact(gravObj: any) {
                const isTouchingLine = Math.abs(gravObj.pos.y + gravObj.radius - this.pos.y + this.offset.y) < gravObj.velocity.y;
                return gravObj.pos.x > this.startX && gravObj.pos.x < this.endX && isTouchingLine;
            }
            triggerOnContact(gravObj: any) {
                if (this instanceof Box) gravObj.base = this.base || this;
                gravObj.pos.y = this.pos.y - gravObj.radius - this.offset.y;
                if (!gravObj.isLanded) gravObj.land(true);
            }
        }

        // ─── PneumaticTube ───
        class PneumaticTube extends WorldObject {
            #directionMapping: any;
            variant: string;
            prev: string;
            ports: string[];
            index: number;
            buttons: any[];
            isLast: boolean;
            expression: string;
            tubeConfig: string;
            tube: HTMLElement;
            walls!: string[];
            velocity!: any;

            constructor({
                group = [], index = 0, pos = { x: 0, y: 0 }, tubeConfig = '',
                prev = '', ports = ['d', 'u'], variant = 'entrance', isLast = true,
            }: any) {
                super({
                    el: Object.assign(document.createElement('div'), {
                        className: 'cf-pneumatic-tube',
                        innerHTML: `<div class="cf-tube cf-pix"></div>`,
                    }),
                    pos,
                });
                this.size = { w: variant === 'entrance' ? 4 : 24, h: 24 };
                this.variant = variant;
                this.group = group;
                this.prev = prev;
                this.ports = ports;
                this.index = index;
                this.buttons = [];
                this.isLast = isLast;
                this.expression = 'joy';
                this.tubeConfig = tubeConfig;
                this.tube = this.el.querySelector('.cf-tube')!;
                this.updateTube();
                this.#directionMapping = { u: 'd', d: 'u', l: 'r', r: 'l' };
                this.el.setAttribute('variant', this.variant);
                this.group![this.index] = this;
                this.el.style.zIndex = String(this.index + 1);
                world.contactElements.push(this);
                this.addToWorld();
                if (this.tubeConfig.length) this.mapFromTubeConfig();
            }
            get deg() {
                const angleMap: any = {
                    0: ['lr', 'rd', 'dr'], 90: ['ud', 'dl', 'ld'],
                    180: ['rl', 'ul', 'lu'], 270: ['du', 'ur', 'ru'],
                };
                return Object.keys(angleMap).find(key => angleMap[key].includes(this.ports[0] + this.ports[1]));
            }
            updateTube() {
                this.walls = ['u', 'd', 'l', 'r'].filter(d => !this.ports.includes(d));
                const [a, b] = this.ports;
                const d = this.variant === 'entrance' || this.isLast ? 28 : 15;
                this.velocity = {
                    x: a === 'l' || b === 'r' ? d : a === 'r' || b === 'l' ? -d : 0,
                    y: a === 'u' || b === 'd' ? d : a === 'd' || b === 'u' ? -d : 0,
                };
                this.tube.style.transform = `rotate(${this.deg}deg)`;
            }
            getVariant(ports: string[]) {
                return ['ud', 'du', 'lr', 'rl'].includes(ports[0] + ports[1]) ? 'straight' : 'elbow';
            }
            calculateOffset(dir: string) {
                const h = this.size!.h;
                const w = h;
                const map: any = {
                    u: { elOffset: { x: 0, y: -h * 2 } },
                    d: { elOffset: { x: 0, y: h * 2 } },
                    l: { elOffset: { x: -w * 2, y: 0 } },
                    r: { elOffset: { x: w * 2, y: 0 } },
                };
                return map[dir];
            }
            mapFromTubeConfig() {
                this.ports = [this.#directionMapping[this.tubeConfig[0]], this.tubeConfig[0]];
                this.updateTube();
                this.tubeConfig.split('').forEach((c, i, arr) => {
                    if (!i) return;
                    const prev = this.#directionMapping[arr[i - 1]];
                    const ports = [prev, c];
                    const { elOffset } = this.calculateOffset(arr[i - 1]);
                    this.group![i] = new PneumaticTube({
                        prev, variant: this.getVariant(ports), group: this.group,
                        index: i,
                        pos: { x: this.group![i - 1].pos.x + elOffset.x, y: this.group![i - 1].pos.y + elOffset.y },
                        ports, isLast: i === this.tubeConfig.length - 1,
                    });
                });
            }
            moveGravObj(gravObj: any) {
                gravObj.base = null;
                addXy(gravObj.pos, this.velocity);
                gravObj.zIndex = this.index;
                gravObj.el.style.zIndex = String(this.index);
                this.walls.forEach(dir => this.clampDirection(dir, gravObj));
                if (this.index === this.group!.length - 1) gravObj.resetZIndex();
            }
            isGravObjInContact(gravObj: any) {
                return this.isPosWithinArea(gravObj.pos) && gravObj.zIndex <= this.index;
            }
            triggerOnContact(gravObj: any) {
                if (this.variant === 'entrance') gravObj.resetZIndex();
            }
        }

        // ─── ConveyorBelt ───
        class ConveyorBelt extends Surface {
            isActive: boolean;
            moveDirection: number;
            moduleNo: number;
            slots!: NodeListOf<Element>;
            expression: string;

            constructor({ pos = { x: 0, y: 0 }, moveDirection = -1, moduleNo = 1, isActive = false }: any) {
                super({
                    el: Object.assign(document.createElement('div'), {
                        className: 'cf-conveyor-belt cf-el',
                        innerHTML: '<div class="cf-btn-wrapper cf-slot"></div><div class="cf-belt-wrapper cf-slot"></div>',
                    }),
                    pos,
                    offset: { x: 4, y: 0 },
                });
                this.isActive = isActive;
                this.moveDirection = moveDirection;
                this.moduleNo = moduleNo;
                this.expression = isActive ? 'neutral' : 'sleepy';
                this.size = { w: 0, h: 0 };
                this.activate(isActive);
                this.addToWorld();
                this.el.style.setProperty('--move-direction', String(this.moveDirection));
                this.slots = this.el.querySelectorAll('.cf-slot');
                this.renderBelt();
                this.setSize();
            }
            activate(bool: boolean) {
                this.isActive = bool;
                this.expression = bool ? 'neutral' : 'sleepy';
                this.el.classList[bool ? 'add' : 'remove']('cf-animate');
            }
            renderBelt() {
                const beltEdge = (cls?: string) => `<div class="cf-belt-edge cf-pix ${cls || ''}"></div>`;
                const modules = new Array(this.moduleNo || 1).fill('').map(() => '<div class="cf-belt-module cf-pix"></div>').join('');
                this.slots[1].innerHTML = beltEdge() + modules + beltEdge('cf-flip');
                this.setSize();
            }
            get surfaceVelocity() {
                return { x: this.isActive ? -4 * this.moveDirection : 0, y: 0 };
            }
            setSize() {
                const rect = this.el.getBoundingClientRect();
                this.size = { w: rect.width || 200, h: rect.height || 48 };
            }
            moveGravObj(gravObj: any) {
                if (gravObj.isLanded && !this.isGrabbed) addXy(gravObj.pos, this.surfaceVelocity);
            }
        }

        // ─── Box (with logo) ───
        class Box extends Surface {
            color: string;
            defaultClass: string;
            velocity: any;
            radius: number;
            expression: string;
            zIndex: number;
            isLanded: boolean;
            logoIndex: number;

            constructor({ pos, color, logoIndex }: any) {
                const boxEl = document.createElement('div');
                boxEl.className = 'cf-box cf-el';
                super({ el: boxEl, offset: { x: 10, y: 10 }, pos });
                this.color = color;
                this.logoIndex = logoIndex ?? Math.floor(Math.random() * LOGOS.length);
                this.defaultClass = 'cf-box cf-el';
                this.velocity = { x: 0, y: 12 };
                this.radius = 10;
                this.size = { w: 10, h: 10 };
                this.expression = 'neutral';
                this.zIndex = 0;
                this.isLanded = false;
                world.objects.push(this);

                // Render logo instead of pixel face
                const logo = LOGOS[this.logoIndex % LOGOS.length];
                this.el.style.setProperty('--bg', logo.color);
                const imgEl = document.createElement('img');
                imgEl.src = logo.src;
                imgEl.alt = logo.name;
                imgEl.className = 'cf-box-logo';
                imgEl.draggable = false;
                this.el.appendChild(imgEl);

                this.addToWorld();
            }
            setExpression(_expression: string) {
                this.expression = _expression;
            }
            get elInContact(): any {
                return world.contactElements.find((el: any) => el !== this && el.isGravObjInContact(this));
            }
            land(bool: boolean) {
                this.isLanded = bool;
                this.el.classList[bool ? 'add' : 'remove']('cf-on-ground');
            }
            hitCheckWalls() {
                const ws = wrapperState.size;
                if (this.pos.x + this.radius > ws.w) this.pos.x = ws.w - this.radius;
                if (this.pos.x - this.radius < 0) this.pos.x = this.radius;
                if (this.pos.y + this.radius > ws.h) this.pos.y = ws.h - this.radius;
                if (this.pos.y - this.radius < 0) this.pos.y = this.radius;
            }
            spaceOutObjects() {
                world.objects.forEach((o: any) => {
                    if (this === o) return;
                    const dist = this.distanceBetween(o.pos);
                    if (dist < this.radius * 2) {
                        const overlap = dist - this.radius * 2;
                        this.pos = this.getNewPosBasedOnTarget({ el: o.pos, maxDistance: overlap / 2 });
                    }
                });
            }
            resetZIndex() {
                this.zIndex = 0;
                this.el.style.zIndex = '0';
            }
            move() {
                if (this.isGrabbed) return;
                const contact = this.elInContact;
                if (contact) {
                    contact.triggerOnContact?.(this);
                    contact.moveGravObj?.(this);
                    this.setExpression(contact.expression || 'neutral');
                    world.objects.filter((o: any) => o.base === this).forEach((d: any) => {
                        d.el.classList.add(contact.transitionClass);
                        contact.moveGravObj?.(d);
                    });
                } else {
                    addXy(this.pos, this.velocity);
                    this.land(false);
                    this.base = null;
                    this.resetZIndex();
                    this.isGrabbed = false;
                    this.setExpression('surprise');
                }
                this.hitCheckWalls();
                this.spaceOutObjects();
                this.setPos();
            }
        }

        // ─── Factory scene (adapted from original working config) ───
        const config = [
            // Logo boxes — placed ON the belts for immediate interaction
            { type: 'box', props: { pos: { x: 200, y: 127 }, logoIndex: 0 } },
            { type: 'box', props: { pos: { x: 260, y: 127 }, logoIndex: 1 } },
            { type: 'box', props: { pos: { x: 320, y: 127 }, logoIndex: 2 } },
            { type: 'box', props: { pos: { x: 380, y: 127 }, logoIndex: 3 } },
            { type: 'box', props: { pos: { x: 440, y: 127 }, logoIndex: 0 } },
            { type: 'box', props: { pos: { x: 500, y: 127 }, logoIndex: 1 } },
            { type: 'box', props: { pos: { x: 560, y: 127 }, logoIndex: 2 } },
            { type: 'box', props: { pos: { x: 620, y: 127 }, logoIndex: 3 } },
            // Top belt — moves left
            {
                type: 'conveyorBelt',
                props: { moduleNo: 16, moveDirection: -1, pos: { x: 100, y: 137 }, isActive: true },
            },
            // Second set on bottom belt
            { type: 'box', props: { pos: { x: 220, y: 247 }, logoIndex: 2 } },
            { type: 'box', props: { pos: { x: 300, y: 247 }, logoIndex: 3 } },
            { type: 'box', props: { pos: { x: 380, y: 247 }, logoIndex: 0 } },
            { type: 'box', props: { pos: { x: 460, y: 247 }, logoIndex: 1 } },
            { type: 'box', props: { pos: { x: 540, y: 247 }, logoIndex: 2 } },
            { type: 'box', props: { pos: { x: 620, y: 247 }, logoIndex: 3 } },
            // Bottom belt — moves right
            {
                type: 'conveyorBelt',
                props: { moduleNo: 16, moveDirection: 1, pos: { x: 100, y: 257 }, isActive: true },
            },
            // Left tube — recirculates bottom → top
            {
                type: 'pneumaticTube',
                props: { tubeConfig: 'uuuurr', pos: { x: 80, y: 267 } },
            },
            // Right tube — recirculates top → bottom
            {
                type: 'pneumaticTube',
                props: { tubeConfig: 'ddddll', pos: { x: 720, y: 127 } },
            },
            // Extras falling from above
            { type: 'box', props: { pos: { x: 300, y: 50 }, logoIndex: 0 } },
            { type: 'box', props: { pos: { x: 450, y: 30 }, logoIndex: 1 } },
            { type: 'box', props: { pos: { x: 550, y: 60 }, logoIndex: 3 } },
            { type: 'box', props: { pos: { x: 400, y: 10 }, logoIndex: 2 } },
        ];

        world.renderFromConfigs(config);
        world.start();

        // Cleanup
        cleanupRef.current = () => {
            world.isPaused = true;
            clearInterval(world.interval);
            while (root.firstChild) root.removeChild(root.firstChild);
        };

        return () => { cleanupRef.current?.(); };
    }, []);

    return (
        <div
            ref={containerRef}
            className="conveyor-factory-root"
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: '900px',
                height: '320px',
                margin: '0 auto',
                overflow: 'hidden',
                borderRadius: '16px',
                background: 'linear-gradient(180deg, #b4b3b3 0%, #a0a0a0 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
            }}
        />
    );
}

/* ─── All CSS scoped with cf- prefix ─── */
const FACTORY_CSS = `
.cf-wrapper {
    position: absolute;
    width: 900px;
    height: 500px;
    pointer-events: none;
    top: 0;
    left: 0;
}
.cf-wrapper * { pointer-events: none; }

/* Pneumatic tubes */
.cf-pneumatic-tube {
    position: absolute;
    --m: 2;
    --w: 24px;
    --h: 24px;
    --frame-no: 1;
    margin-top: calc(var(--h) * -1);
    margin-left: calc(var(--w) * -1);
    z-index: 10;
}

.cf-pneumatic-tube[variant='straight'] .cf-tube {
    --bg-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAPElEQVR4AeyVsQkAAAjD1P9/1hM6ZZFkFoS00CmYBw8WZhrmQQZwS0tF0bCKVBQNxANblBXBe7MOTszgAAAA//+VdSGoAAAABklEQVQDANbXwDGnv3nqAAAAAElFTkSuQmCC);
}
.cf-pneumatic-tube[variant='elbow'] .cf-tube {
    --bg-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAeklEQVR4AeyUSwrAIAxEW+9/Z2UWAwHjJzK60UBoKfa9Zqimb3NdKMjBmorIMv9gdQUEW2b0n2gKACc4CrXrXQHhduHqvStYhXnvVQLl10NYCfBQ2WcF6niQxNkJYFT3m2CY6IuoGRH2FHpLRADzqJcLCOdocgHBvBYAAAD//xGdci8AAAAGSURBVAMAj7dkKYBqE1kAAAAASUVORK5CYII=);
}
.cf-pneumatic-tube[variant='entrance'] .cf-tube {
    --bg-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAaElEQVR4AeyTMQoAMAgD2/7/zy0BM1jazdsURFxyGHUNOBqQDN6PKLVoPqIUkMaJpgFhxL8gFumYjEQAEjcEAxiCAgRBAfo7DCBxbAKLYwAJOzGLGmAHUtX33lm6A13PnaWANE40OOAAAAD//2ff7uMAAAAGSURBVAMAMuw0MaZMgU0AAAAASUVORK5CYII=);
}

/* Conveyor belt */
.cf-conveyor-belt {
    position: absolute;
    --m: 4;
    --h: 12px;
    --move-direction: -1;
    --frame-no: 5;
}
.cf-belt-wrapper { display: flex; }
.cf-btn-wrapper { display: none; }

/* Pixel rendering */
.cf-pix {
    overflow: hidden;
    position: relative;
    --width: calc(var(--m) * var(--w));
    --height: calc(var(--m) * var(--h));
    width: var(--width);
    height: var(--height);
}
.cf-pix::after {
    content: '';
    image-rendering: pixelated;
    position: absolute;
    width: calc(var(--width) * var(--frame-no));
    height: var(--height);
    background-image: var(--bg-image);
    background-size: cover;
    animation: cf-frame-animation 0.5s infinite steps(calc(var(--frame-no) - 1));
    animation-play-state: paused;
}
.cf-conveyor-belt .cf-pix {
    width: calc(var(--width) - (var(--m) * 2px));
    height: calc(var(--height) - (var(--m) * 2px));
}
.cf-conveyor-belt .cf-pix::after {
    top: calc(-1px * var(--m));
    left: calc(-1px * var(--m));
}
.cf-animate .cf-pix::after {
    animation-play-state: running;
}

.cf-belt-module {
    --w: 7px;
    --bg-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAMCAYAAADoIwS6AAAAjklEQVR4AezUywmEQBBF0ZnJwvyDM4yRI1wpBPcuWri8TykUrfj7vOg6l9m27T+57zdnfPM8jTnTyRQ8+CjTc5l9378Tg8mc8c3yNOZMJ1Pw4KNMz2WYN7CWeXoL62TWyTydwFN/fTP9hNIeKKf1tI6WKXS4+3LqHsjXMv2EUkOUU13UUV2aL1PokaehPwAAAP//z+meLwAAAAZJREFUAwB+U6AZmRQ4AQAAAABJRU5ErkJggg==);
}
.cf-belt-edge {
    --w: 11px;
    --bg-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG4AAAAYCAYAAAAbIMgnAAACh0lEQVR4AeyWAW7jQAwDffeL/P9xecYdBgZdWZHoTb0FYtQFWGlFitmVGqB/l/vnkhO4F3fJtS3L8OIej8c/h3ffLy/16dxF6Y5i7pc+13UWfxSlz1F9XV18F3NfPqtPdZ3bxWWhGs7G23ed4Nk5lIvDdLVfFuXP5/OPg/Quyksa/GLOuYN0Vax85SO9zjmKr6LzlY/6dFZUvYvoxJF3yBqdXxYXLyszic/Eq/nyVt6vqJzzGcyaw25x2fTMBWPv7btOQ3NQXKvf+71bnCxm/XXJT/FKvjOGq3fnOGMO2+JGLoomIl+oOqOv6rGGJiJyLj8aQPQkd17iRnRoItTrInrHw6GJoNZhW5wE3TAwlEaxqonLsfb9+ucn6m/fdRpuDi+LW1v2v52B43BhYYA8w/U6Dh94QJ7R1dE5Dt7B9TrOecK53o4bWhzmNz5rAtvi+FaA2dfjLwbM9v3tftvifvsgrvb+bXF8K0D1APdNdFzlFWuu13HRo8pdr+Mqr1hzvY7DAx6QZ3R1dB23LQ4ReGd5nSk+GVfyde+quKqW36/zrDlsixv5cDQRuoyL6B0PhyaC2hHQj2jQCUd6eLREBzQRThu5bmnSRE9y1au4LS6SRx8Qte/kV/HlnsI77xvV4j2q7XS7xcUtzzDXh/60b/TXZw7FRhT9PnUOu8XxjnzpWRe/fZnussyaw8visI/mnOPyyB3Qd4i+yp0XXOeV61FL3kF94nWuou4oTj0xdpzqVex8pY3+OZemXBwk5oB8JvAEMz3xwhOQzwSeYKYnXngC8u+gXZzMMAf5TK2CdKOx8oi1UR/pYm+VZ53OR7HyoqY+8gjVj2LVE2s5l9/h4iS842dN4D8AAAD//0D8heAAAAAGSURBVAMAW8EMXhplLEUAAAAASUVORK5CYII=);
}
.cf-flip { transform: scale(-1, -1); }

@keyframes cf-frame-animation {
    0% { background-position: calc(var(--width) * var(--move-direction)) calc(var(--height)); }
    100% { background-position: calc(var(--width) * var(--move-direction) * var(--frame-no)) calc(var(--height)); }
}

/* Box with logo */
.cf-box {
    position: absolute;
    width: 28px;
    height: 28px;
    margin-top: -14px;
    margin-left: -14px;
    transition: 0.1s;
    z-index: 5;
    background: rgba(12, 12, 30, 0.85);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.cf-box-logo {
    width: 22px;
    height: 22px;
    object-fit: contain;
    pointer-events: none;
    image-rendering: auto;
}
.cf-no-transition { transition: 0s; }
.cf-on-ground .cf-box-logo {
    animation: cf-plop forwards 0.4s;
    transform-origin: center bottom;
}
@keyframes cf-plop {
    0% { transform: scale(1); }
    90% { transform: scale(1.15, 0.92); }
    100% { transform: scale(1); }
}

.cf-btn { display: none; }
`;
