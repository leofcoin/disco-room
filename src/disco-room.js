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
    
    ipfs.pubsub.subscribe(topic, async (message) => {
      console.log(message.data);
      try {
        message.data = ab2str(message.data);
        message.data = JSON.parse(message.data);
        
        const { peer, peers } = message.data;
        if (peer && peer !== this.id && this.peers.indexOf(peer) === -1) {        
          this.broadcast({ type: 'peerlist', for: peer, peers: this.peers });
          try {              
            await this.ipfs.swarm.connect('/ipfs/' + peer);
            this.peers.push(peer);
          } catch (e) {
            console.error(e);  
          }
        }
        else if (message.data.for === this.id && peers && peers.length > 1) {
          peers.forEach(async peer => {
            try {              
              if (this.peers.indexOf(peer) === -1 && peer !== this.id) {
                await this.ipfs.swarm.connect('/ipfs/' + peer)
                this.peers.push(peer);
              }              
            } catch (e) {
              console.error(e);  
            }
          });
        }
      } catch (e) {
        console.error(e);
      }      
      // super.emit('message', message);
    }, (err, res) => {});
    
    this._peerJoined = this._peerJoined.bind(this);
    this._peerLeft = this._peerLeft.bind(this);
    this._subscribed = this._subscribed.bind(this);
    
    this.init();
    // this.ipfs.id().then(({ id }) => {
    // this.broadcast(JSON.stringify({type: 'joining', from: id}))  
    // })
    
  }
  
  async init() {
    const { id } = await this.ipfs.id();
    this.id = id;
    
    this.on('join', this._peerJoined);
    this.on('leave', this._peerLeft);
    this.on('error', error => console.error(error));
    this.on('subscribed', this._subscribed);
    
    this.broadcast({ type: 'peer-joined', peer: this.id });   
  }


  async broadcast(data) {
    await this.ipfs.pubsub.publish(this.topic, Buffer.from(str2ab(JSON.stringify(data))));
  }

  _subscribed() {
    this.subscribed = true;
  }

  _peerJoined(peer) {
    console.log(peer); 
    if (this.peers.indexOf(peer) === -1) this.peers.push(peer);
    
    // this.whisper(peer)
  }

  _peerLeft(peer) {
    this.peers.splice(this.peers.indexOf(peer), 1);
  }

  // async whisper(peerID, event) {  
  //   console.log(peerID, 'whisper');  
  //   event.from = this.id;
  //   peerID = `/ipfs/${peerID}`;
  //   const channel = await Channel.open(this.ipfs, peerID);
  //   // await channel.connect();
  //   console.log('conne');
  //   channel.on('message', async (message) => {
  //     console.log(message);
  //     if (message.from !== this.id) {
  //       if (message.type === 'join') {
  //         const index = message.data.indexOf(this.id);
  //         if (index !== -1) message.data.splice(index, 1);
  //         this.ipfs.swarm.connect(message.data);
  //         channel.close();
  //       } else {
  //         await this.whisper(message.from, { type: 'join', from: this.id, data: this.peers});
  //         channel.close();
  //       }
  //     }
  //   });
  //   return channel.emit('message', event)
  // }
}