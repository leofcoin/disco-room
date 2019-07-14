// import Channel from 'ipfs-pubsub-1on1';
import PeerMonitor from 'ipfs-pubsub-peer-monitor';

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}
function str2ab(str) {
  var buf = new ArrayBuffer(str.length); // 2 bytes for each char
  var bufView = new Uint8Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

export default class DiscoRoom extends PeerMonitor {
  /**
   * @param {object} ipfs - ipfs api
   * @param {array} space - ['directory', 'multihash', 'label']
   * @param {string} id - optional
   */
  constructor(ipfs, topic) {
    super(ipfs.pubsub, topic);
    this.ipfs = ipfs;
    this.topic = topic;
    this.peers = [];
    
    this._peerJoined = this._peerJoined.bind(this);
    this._peerLeft = this._peerLeft.bind(this);
    this._subscribed = this._subscribed.bind(this);    
    this._onTopicMessage = this._onTopicMessage.bind(this);
    
    this.init();    
  }
  
  async init() {
    const { id } = await this.ipfs.id();
    this.id = id;
    
    this.on('join', this._peerJoined);
    this.on('leave', this._peerLeft);
    this.on('error', error => console.error(error));
    this.on('subscribed', this._subscribed);
    
    await this.ipfs.pubsub.subscribe(this.topic, this._onTopicMessage);
    this.broadcast({ type: 'peer-joined', peer: this.id });   
  }


  async broadcast(data) {
    const arrayBuffer = str2ab(JSON.stringify(data));
    const buffer = Buffer.from(arrayBuffer, 'ArrayBuffer');
    await this.ipfs.pubsub.publish(this.topic, buffer);
  }
  
  thisPeer(peer) {
    if (!peer) return true;
    return Boolean(peer === this.id)
  }
  
  hasPeer(peer) {
    const index = this.peers.indexOf(peer);
    return Boolean(index !== -1);
  }
  
  async _pushAndConnect(peer) {
    if (!this.hasPeer(peer)) this.peers.push(peer);
    let peers = await this.ipfs.swarm.peers()
    peers = peers.map(({peer}) => peer._idB58String)
    if (peers[peer]) return;
    try {
      await this.ipfs.swarm.connect('/p2p-circuit/ipfs/' + peer);
    } catch (e) {
      console.error(e);  
    }
  }
  
  async _onTopicMessage(message) {
    try {
      let data = ab2str(message.data);
      data = JSON.parse(data);      
      const { peer, peers, from } = data;
      
      if (!this.thisPeer(peer)) {        
        this.broadcast({ type: 'peerlist', for: peer, peers: this.peers });
        
        await this._pushAndConnect(peer);
      } else if (this.thisPeer(message.data.for) && peers && peers.length > 1) {
        peers.forEach(async peer => {
          if (!this.thisPeer(peer)) {
            await this._pushAndConnect(peer);
          }   
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  _subscribed() {
    this.subscribed = true;
  }
  
  /**
   * rebroadcast 'peer-joined' message to client connected peers
   * typically new connected nodes will only have one connection at first.
   * 
   * @param {string} peer - base58 string of the peer id
   * @param {string} type 'peer-joined' - event name
   * @param {string} from [this.id]
   */
  _rebroadcast(peer, type = 'peer-joined') {
    this.broadcast({ type, peer, from: this.id });
  }

  async _peerJoined(peer) {    
    if (!this.hasPeer(peer)) {
      console.log(`${peer} joined`);
      await this._pushAndConnect(peer);
      this._rebroadcast(peer);
    }
  }

  _peerLeft(peer) {
    console.log(`${peer} left`);
    const index = this.peers.indexOf(peer);
    if (index !== -1) this.peers.splice(index, 1);
  }
}