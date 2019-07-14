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
    await this.ipfs.pubsub.publish(this.topic, Buffer.from(arrayBuffer), 'ArrayBuffer');
  }
  
  async _onTopicMessage(message) {
    try {
      let data = ab2str(message.data);
      data = JSON.parse(data);      
      const { peer, peers, from } = data;
      
      if (peer && peer !== this.id && this.peers.indexOf(peer) === -1) {        
        this.broadcast({ type: 'peerlist', for: peer, peers: this.peers });
        this.peers.push(peer);
        try {
          await this.ipfs.swarm.connect('/p2p-circuit/ipfs/' + peer);
        } catch (e) {
          console.error(e);  
        }
      }
      else if (message.data.for === this.id && peers && peers.length > 1) {
        peers.forEach(async peer => {
          try {              
            if (this.peers.indexOf(peer) === -1 && peer !== this.id) {
              this.peers.push(peer);
              await this.ipfs.swarm.connect('/p2p-circuit/ipfs/' + peer)
            }              
          } catch (e) {
            console.error(e);  
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

  _peerJoined(peer) {
    console.log(`${peer} joined`);
    if (this.peers.indexOf(peer) === -1) {
      this._rebroadcast(peer);
      this.peers.push(peer);      
    }
  }

  _peerLeft(peer) {
    console.log(`${peer} left`);
    const index = this.peers.indexOf(peer);
    if (index !== -1) this.peers.splice(index, 1);
  }
}