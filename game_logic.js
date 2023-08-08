
const do_explore_movement = (npc_state,nn_movement_pattern) => ({
    do_explore_movement: () => {},
});

//checkIfObserveEntity polls a radius around npc for other entities, if found, passes their references to classifyObservedEntity() which activates branching logic (i.e call doPursueObservedEntity() or doFleeObservedEntity())
const can_check_if_observe_entity = () => ({
    check_if_observe_entity: () => {},
});
const can_classify_observed_entity = () => ({
    classify_observed_entity: (target_ent) => {},
});
const can_pursue_observed_entity = () => ({
    pursue_observed_entity: (target_ent) => {},
});
const can_flee_observed_entity = () => ({
    flee_observed_entity: (target_ent) => {},
});

/* Deprecated //Save out any trained neural networks to JSON files for re-use
const can_save_networks_to_JSON = () => ({
    save: (type_name,nn_network,optional_type_suffix) => {},
});

//Load existing network from file. The file informs the type and thus where to load it into in the NPC primary state
const can_load_JSON_networks = () => ({
    load: (JSON_object_to_load) => {},
});*/

//A shortcut to add all basic npc functions, use like ...npc_core_featureset when invoking the npc factory function
const npc_core_featureset = [
    do_explore_movement,
    can_check_if_observe_entity,
    can_classify_observed_entity,
    can_pursue_observed_entity,
    can_flee_observed_entity,
];

//A generic - pass the appropriate type_name and nn_pair to configure specific behavior i.e aggressive vs passive vs fearful, pass traits in the functional_capabilities parameter as an array (notice it gets spread out in the return)
const npc = (type_name,sprite,functional_capabilities,initial_meta_classifier_nn, initial_vision_classifier_nn, initial_explore_movement_mode,initial_attitude_mode) => {
    let state = {
        type_name,
        sprite,

        //Target_vectors is filled with objects containing data on a target within the sight range of the npc. Position is relative to the NPCs position, NOT absolute to the world. Target_vectors should be used only internally by the classifier networks.
        target_vectors: [],
        //Current_target_vector is the focus of attention and movement.
        current_target_vector: null,

        //Classifier modes are single neural nets
        all_classifier_modes: [],
        //Movement modes are dual neural nets, one for each axis
        all_movement_modes: [],
        //Attitude modes are variable neural nets, with unusual layer configurations for modeling abstract data
        all_attitude_modes: [],

        //The network training to use to observe right now. Set to null before training/loading nets.
        current_meta_classifier_mode: initial_meta_classifier_nn,

        //The network training to use to observe right now. Set to null before training/loading nets.
        current_vision_classifier_mode: initial_vision_classifier_nn,
        
        //The network training to use to move and explore. Set to null before training/loading nets.
        current_movement_mode: initial_explore_movement_mode,
        
        //The network training to use to react to observations, likely to shift other modes as part of its response. Set to null before training/loading nets.
        current_attitude_mode: initial_attitude_mode,
    }

    return Object.assign(state, ...functional_capabilities);
}

const npc_trainer = (type_name,nn_network_x,nn_network_y) => {
    let state = {

    }

    return Object.assign(state);
}

class AI_Manager_Plugin extends Phaser.Plugins.BasePlugin {
    constructor(pluginManager) {
        super(pluginManager);
        
        //Contains the neural network data for each type of NPC, spawned NPCs will have a string ID referencing their type, that can be used to access the appropriate neural network when processing inputs and outputs for each NPC (rather than each having their own identical copies of neural networks)
        //Remember, neural networks are static once trained, so NPCs can share networks without issue during play
        //Npc_types is a Map object, with the key being the string ID used to access the networks
        //Npc_types is loaded during TitleScreenState initialization, from a JSON config file specifying the different NPC types (and thus the menu options to train them)
        this.npc_types = new Map();

        //Used by save_networks_to_blob() to update a scenario after training 
        this.current_scenario;

        //contains instances of "npc" object-composed entity
        this.npcs = [];

        this.training_data_x = [];
        this.training_data_y = [];
        this.training_data_classifier = [];
    }

    save_networks_to_blob() {
        //Loop over all loaded NPCs, serialize them into an array of JSON objects
        let networks_array = this.npcs.map( npc => ({
            type_name,
            sprite,
            all_classifier_modes: npc.all_classifier_modes.map(c_nn => c_nn.toJSON()),
            //Movement modes are dual neural nets, one for each axis
            all_movement_modes: npc.all_movement_modes.map(move_nn_pair => ([move_nn_pair.x.toJSON(), move_nn_pair.y.toJSON()])),
            //Attitude modes are variable neural nets, with unusual layer configurations for modeling abstract data
            all_attitude_modes: [],
        }));

        //TODO Use value in this.current_scenario to save out an updated JSON scenario file after training
    }

    train_network(npc_network, training_params_obj, training_data) {
        let nn_trainer = new synaptic.Trainer(npc_network);

        nn_trainer.train(training_data, {
            rate: training_params_obj.learning_rate,
            iterations: training_params_obj.iterations,
            shuffle: training_params_obj.do_data_shuffle
        });

    }

    finish_training(training_mode, npc) {
        switch(training_mode) {
            case "movement": {
                //TODO Train X Movement Network
                this.train_network(npc.current_movement_mode.x, {learning_rate: 0.000001, iterations: 20000, do_data_shuffle: false}, this.training_data_x);
                //TODO Train Y Movement Network;
                this.train_network(npc.current_movement_mode.y, {learning_rate: 0.000001, iterations: 20000, do_data_shuffle: false}, this.training_data_y);
                break;
            }
            case "classifying": {
                //TODO Train Classifer Network
                this.train_network(npc.current_meta_classifier_mode, {learning_rate: 0.000001, iterations: 20000, do_data_shuffle: false}, this.training_data_classifier);
                break;
            }
        }
    }

    normalize_conversion(value,old_max,old_min,new_max,new_min){
        if(isNaN(value) || isNaN(old_max) || isNaN(old_min) || isNaN(new_max) || isNaN(new_min)) {
            console.log("NaN Detected in normalizer!");
        }
        let old_range = (old_max - old_min);
        let new_range = (new_max - new_min);
        let new_value = (((value - old_min) * new_range) / old_range) + new_min;
        //console.log("old val:", value);
        //console.log("new val: ",new_value);
        return new_value;
    }

    denormalize_conversion(value,old_max,old_min,new_max,new_min){
        let old_range = (old_max - old_min);
        let new_value = value * old_range + old_min;
        console.log("old val:", value);
        console.log("new val: ",new_value);
        return new_value;
    }

    //Additional methods for getting managing player data
   is_trained() {
        return this.trainingData.length > 1;
    }

    reset_training() {
        this.training_data_x = [];
        this.training_data_y = [];
    }
    

    //input_params is an array of tuples with x&y positions of entities spotted by npc_looks_around function
    will_npc_move(npc, input_params, meta_classifier_outcome){

        if(meta_classifier_outcome !== current_movement_mode) current_movement_mode = all_movement_modes.filter(mode => mode.type === meta_classifier_outcome).pop()
        // New code
        let move_vec;
        let move_vel_x;
        let move_vel_y;

        let nn_output_x = npc.state.current_movement_mode.x_net.activate(input_params[0]);
        let nn_output_y = npc.state.current_movement_mode.y_net.activate(input_params[1]);
        
        if (nn_output_x[0] > nn_output_x[1]) {
            move_vel_x = -150;
        }
        else if(nn_output_x[0] === nn_output_x[1]) {
            move_vel_x = 0;
        }
        else {
            move_vel_x = 150;
        }

        if (nn_output_y[0] > nn_output_y[1]) {
            move_vel_y = -150;
        }
        else if(nn_output_y[0] === nn_output_y[1]) {
            move_vel_y = 0;
        }
        else {
            move_vel_y = 150;
        }

        npc.state.sprite.setVelocityX(move_vel_x);
        npc.state.sprite.setVelocityY(move_vel_y);
    }

    what_does_npc_see(npc) {
        //TODO SIGHTFUNCTION

        //RETURN array of objects {x, y, type}, to feed into what_does_npc_think()
    }

    what_does_npc_think(npc, input_params) {
        //processed_input_params items get incremented each time the matching classifier is activated in an input_param
        let processed_input_params = [0,0,0,0];
        let meta_classifier_output;
        
        //Validate types of input_params
        input_params.forEach( input => {
            if(input.x === NaN || input.y === NaN || ( !(input.type instanceof String) || !(typeof input.type === 'String') )) throw new Error("incorrect data in input_params");

            //Take input, produce output array like [0,0,0,0] matching classifier format
            let classified_input = npc.state.current_vision_classifier_mode.activate(input);

            //Sum the current input array into the current state of processed_input_params
            processed_input_params.map( (num, index) => num + classified_input[index]);
        });

        meta_classifier_output = npc.state.current_meta_classifier_mode.activate(processed_input_params);

        if(meta_classifier_output[0] < 0.45) {
            will_npc_move(npc, input_params, "flee");
        } else if(meta_classifier_output[0] > 0.45 && meta_classifier_output[0] < 0.55) {
            will_npc_move(npc, input_params, "stay");
        } else {
            will_npc_move(npc, input_params, "pursue");
        }


        if(meta_classifier_output[1] < 0.45) {
            will_npc_move(npc, input_params, "flee");
        } else if(meta_classifier_output[1] > 0.45 && meta_classifier_output[1] < 0.55) {
            will_npc_move(npc, input_params, "stay");
        } else {
            will_npc_move(npc, input_params, "pursue");
        }


        if(meta_classifier_output[2] < 0.45) {
            will_npc_move(npc, input_params, "flee");
        } else if(meta_classifier_output[2] > 0.45 && meta_classifier_output[2] < 0.55) {
            will_npc_move(npc, input_params, "stay");
        } else {
            will_npc_move(npc, input_params, "pursue");
        }


        if(meta_classifier_output[3] < 0.45) {
            will_npc_move(npc, input_params, "flee");
        } else if(meta_classifier_output[3] > 0.45 && meta_classifier_output[3] < 0.55) {
            will_npc_move(npc, input_params, "stay");
        } else {
            will_npc_move(npc, input_params, "pursue");
        }
    }

    push_training_data_x(data) {
        this.training_data_x.push(data);
    }

    push_training_data_y(data) {
        this.training_data_y.push(data);
    }

    push_training_data_classifier(data) {
        this.training_data_classifier.push(data);
    }


}



var TitleScreenScene = new Phaser.Class({
    Extends: Phaser.Scene,

    load_current_menu_buttons: function(btn_array) {
        this.current_layers_buttons.forEach( button_prototype => button_prototype.destroy());
        this.current_layers_buttons = [];

        this.btn_array.forEach( (button_prototype, index) => {
            this.current_layers_buttons.push(
                this.add.text(this.cameras.main.centerX, this.cameras.main.centerY + (index * 15), button_prototype.label, { fill: '#0f0' })
                .setOrigin(0.5)
                .setPadding(10)
                .setStyle({ backgroundColor: '#111' })
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', button_prototype.on_click)
                .on('pointerover', () => this.startButton.setStyle({ fill: '#f39c12' }))
                .on('pointerout', () => this.startButton.setStyle({ fill: '#FFF' }))
            )
        });
    },

    choose_gamemode: function(event) {
            // Calculate the corners of the menu
            
            //TODO: CAN WE REPLACE WITH REGISTERED CLICK EVENTS INSTEAD OF COLLISION POLLING LOL
            //TODO: NEED NEW NESTED MENU SYSTEM AS FOLLOWS:
            //1. Existing two buttons, training/play.
            //2. If training clicked, show label "Choose NPC type to train" with buttons below saying "AGGRESSIVE", "PASSIVE", "FEARFUL"
            //3. Once type picked, show label "Choose mode to train", with buttons below saying "OBSERVING", "EXPLORING", "ATTITUDE"
            //4. Once final selection made, launch GameLoopScene with parameters as well as a preconfigured training scenarior aligned with the "NPC Type" being trained. i.e multiple passive/fearful NPCs. When doing initial training, its ok if the other NPCs stay still (or better have randomized movement). Once all types have been trained, each one can be individually re-trained with the others over and over again

            let menu_x1 = this.sys.game.canvas.width/2 - 270/2, menu_x2 = this.sys.game.canvas.width/2 + 270/2,
                menu_y1 = this.sys.game.canvas.height/2 - 180/2, menu_y2 = this.sys.game.canvas.height/2 + 180/2;
    
            let mouse_x = event.x  ,
                mouse_y = event.y  ;
    
            if(mouse_x > menu_x1 && mouse_x < menu_x2 && mouse_y > menu_y1 && mouse_y < menu_y2 ) {
                
                //Training Mode
                if(mouse_x >=menu_x1 && mouse_x <=menu_x2 && mouse_y >=menu_y1 && mouse_y <=menu_y1+90) {
                    console.log("Entering training gameloop scene");
                    this.training_complete=false;
                    //this.ai_manager.resetTraining();
                    //game_mode = false;

                    //TODO: Need to implement sub-modes of training for each primary npc type, then for each, each type of nn behavior (currently 3 modes per npc). Should have dynamic buttons with an up-down cursor to select which mode to train. Make choice, choice stored, show next nested layer of menus for further choices related to that choice.

                    //1. Select NPC type to train

                    //2. Select behavior mode to train

                    //3. Start GameLoopScene with both choices
                    
                    //CALL SCENE CHANGE TO GameLoopScene PASS TO training_type "TRAINING_AGGRESSIVE" or "TRAINING_PASSIVE" or "TRAINING_FEARFUL" && PASS TO behavior_mode "OBSERVER_MODE","EXPLORE_MODE","ATTITUDE_MODE"
                    this.scene.start('GameLoopScene', {training_type: " ", behavior_mode: " "});

                }
                //Playing Mode
                else if (mouse_x >=menu_x1 && mouse_x <=menu_x2 && mouse_y >=menu_y1+90 && mouse_y <=menu_y2) {
                    if(!this.training_complete) {
                        console.log("Training using Data set of "+ this.ai_manager.trainingData.length +" elements" );

                        //This may need to be moved. This is called only after training data has been collected.
                        this.ai_manager.train_network();
                        this.training_complete=true;
                    }
                    //game_mode = true;

                    //CALL SCENE CHANGE TO GameLoopScene PASS "PLAYING"
                    console.log("Starting GameLoopScene")
                    this.scene.start('GameLoopScene', {mode_chosen: "playing"});
                }
                //menu.destroy();
                console.log("destroy");
                
                //reset_state_variables();
            }
    },

    initialize: function TitleScreenScene () {
        Phaser.Scene.call(this, { key: 'TitleScreenScene' });
        this.menu;
        this.game_mode;
        this.training_complete = false;
        this.training_subject;
        this.training_mode;
        this.training_movement_type;
        this.training_classifying_type;
        this.current_layers_buttons = [];

        this.main_menu_layer = [
            {label: "Training", on_click: () => {
                this.game_mode = "training";
                this.load_current_menu_buttons(this.training_subject_menu_layer);

            } },
            {label: "Play", on_click: () => {
                this.game_mode = "playing";
                this.scene.start('GameLoopScene', {mode_chosen: "playing"});
            } },
        ];

        this.training_subject_menu_layer = [
            {label: "Herbivore", on_click: () => {
                this.training_subject = "herbivore";
                this.load_current_menu_buttons(this.training_mode_menu_layer);
            } },
            {label: "Carnivore", on_click: () => {
                this.training_subject = "carnivore";
                this.load_current_menu_buttons(this.training_mode_menu_layer);
            } },
        ];

        this.training_mode_menu_layer = [
            {label: "Movement", on_click: () => {
                this.training_mode = "movement"
                this.load_current_menu_buttons(this.training_movement_type_menu_layer);
            } },
            {label: "Classifying", on_click: () => {
                this.training_mode = "classifying";
                this.load_current_menu_buttons(this.training_classifying_type_menu_layer);
            } },
        ];

        this.training_movement_type_menu_layer = [
            {label: "Exploring", on_click: () => {
                this.training_movement_type = "mov-exploring"
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_movement_type
                }});

            } },
            {label: "Chasing", on_click: () => {
                this.training_movement_type = "mov-chasing";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_movement_type
                }});

            } },
            {label: "Hiding", on_click: () => {
                this.training_movement_type = "mov-hiding";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_movement_type
                }});

            } },
            {label: "Regain Line-of-Site", on_click: () => {
                this.training_movement_type = "mov-regainsight";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_movement_type
                }});

            } },
        ];

        this.training_classifying_type_menu_layer = [
            {label: "Recognize Own-Hunger", on_click: () => {
                this.training_classifying_type = "rec-own-hunger";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Ally-Hunger", on_click: () => {
                this.training_classifying_type = "rec-ally-hunger";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Own-Safety", on_click: () => {
                this.training_classifying_type = "rec-own-safety";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Ally-Safety", on_click: () => {
                this.training_classifying_type = "rec-ally-safety";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Own-Threat", on_click: () => {
                this.training_classifying_type = "rec-own-threat"
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Ally-Threat", on_click: () => {
                this.training_classifying_type = "rec-ally-threat";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Prey", on_click: () => {
                this.training_classifying_type = "rec-prey";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Ally", on_click: () => {
                this.training_classifying_type = "rec-ally";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize FoodObject", on_click: () => {
                this.training_classifying_type = "rec-foodobj";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Recognize Ideal-HidingPlace", on_click: () => {
                this.training_classifying_type = "rec-hidingplace";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Investigate Sign-of-Threat", on_click: () => {
                this.training_classifying_type = "inv-signofthreat";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Investigate Sign-of-Prey", on_click: () => {
                this.training_classifying_type = "inv-signofprey";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
            {label: "Investigate Sign-of-FoodObject", on_click: () => {
                this.training_classifying_type = "inv-signoffoodobj";
                this.scene.start('GameLoopScene', {mode_chosen: "training", training_params: {
                    training_subject: this.training_subject,
                    training_mode: this.training_mode,
                    training_sub_mode: this.training_classifying_type
                }});
            } },
        ];
    },

    preload: function() {
        console.log(game);
        this.load.image('menu', 'assets/game/menu.png');
    },


    create: function () {
        console.log("TitleScreen init", this.scene.get('GameLoopScene'));
        this.input.on('pointerdown', (pointer) => {console.log("pointer on menu: ", pointer); this.choose_gamemode(pointer);});
        let bg_img = this.add.image(this.cameras.main.width / 2, this.cameras.main.height / 2, 'menu');
        
        

    },

    update: function () {
    }
});

var GameLoopScene = new Phaser.Class({
    Extends: Phaser.Scene,

    return_to_menu_scene: function (current_gamemode) {
        console.log("menu");

        if(current_gamemode === "training") {
            //This trains the neural net(s) on the accumulated training data before, saving the trained networks and returning to the main menu
            this.ai_manager.finish_training(training_sub_mode, this.training_npc);
            this.scene.start('TitleScreenScene');

            //TODO SAVE TRAINED NETWORK TO FILE OR STORAGE BLOB
        } else if(current_gamemode === "playing") this.scene.start('TitleScreenScene');
        
    },

    //TODO add args to this for target & receive ents 
    entities_just_collided: function() {
        //This function should eventually have some more complex logic calibrating the NN with victories/losses
        //console.log("Entities just collided!");
        this.return_to_menu_scene();
    },


    entity_just_collided_with_building: function() {
        //TODO Stop movement, solid collision
    },

    //Will need to be refactored. Human can see the entire map at once, the NPCs cannot and instead use observer functions/NNs. During training movement patterns, do NOT move directly towards targets. Do exploratory movement, and if you happen to pass within the observable radius (visible during training), THEN do whatever movement towards the target. The observer function will be watching while you're moving and will fire when in vicinity of the target, adding additional input_neuron activation when moving around an observable entity
    will_player_move_during_movetraining: function(training_mode) {
        
        if (this.upButton.isDown ){
            player.setVelocityY(-150);
            
            //These ! checks are supposed to ensure that training data is captured for the both axis' every frame (0 output for the non-pushed buttons), as by default each tick would only enter one button press branch, resulting in lopsided training data.
            if(!this.leftButton.isDown && !this.rightButton.isDown) {
                this.ai_manager.push_training_data_x({
                    'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING, this.player.x],
                    'output':  [0,0]
                });
            }

            this.ai_manager.push_training_data_y({
                'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.y],
                'output':  [1,0]
            });
        } 
        else if (this.downButton.isDown){
            target_ent.setVelocityY(150);

            if(!this.leftButton.isDown && !this.rightButton.isDown) {
                this.ai_manager.push_training_data_x({
                    'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x],
                    'output':  [0,0]
                });
            }

            this.ai_manager.push_training_data_y({
                'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.y],
                'output':  [0,1]
            });
        }
        else {
            target_ent.setVelocityY(0);
        }
        if (this.leftButton.isDown){
            target_ent.setVelocityX(-150);

            this.ai_manager.push_training_data_x({
                    'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x],
                    'output':  [1,0]
            });

            if(!this.upButton.isDown && !this.downButton.isDown) {
                this.ai_manager.push_training_data_y({
                    'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.y],
                    'output':  [0,0]
                });
            }
        }
        else if (this.rightButton.isDown){
            target_ent.setVelocityX(150);

            this.ai_manager.push_training_data_x({
                'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x],
                'output':  [0,1]
            });

            //These ! checks are supposed to ensure that training data is captured for the both axis' every frame (0 output for the non-pushed buttons), as by default each tick would only enter one button press branch, resulting in lopsided training data.
            if(!this.upButton.isDown && !this.downButton.isDown) {
                this.ai_manager.push_training_data_y({
                    'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.y],
                    'output':  [0,0]
                });
            }
        }
        else {
            target_ent.setVelocityX(0);
        }
    },

    did_player_push_training_classifier_button: function() {
        this.numpad_keys.forEach( (key, index) => {
            if(key.isDown) {
                switch(index) {
                    case 0: break;
                    case 1: break;
                    /* FLEE */
                    case 2: this.ai_manager.push_training_data_classifier({
                        'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x,this.player.y],
                        'output':  [1,0,0,0]
                    }); break;
                    case 3: break;
                    /* INVESTIGATE */
                    case 4: this.ai_manager.push_training_data_classifier({
                        'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x,this.player.y],
                        'output':  [0,1,0,0]
                    }); break;
                    case 5: break;
                    /* REGAIN LINE-OF-SIGHT */
                    case 6: this.ai_manager.push_training_data_classifier({
                        'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x,this.player.y],
                        'output':  [0,0,1,0]
                    }); break;
                    case 7: break;
                    /* ATTACK */
                    case 8: this.ai_manager.push_training_data_classifier({
                        'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x,this.player.y],
                        'output':  [0,0,0,1]
                    }); break;
                    case 9: break;
                    /* NOTHING PRESSED */
                    default: this.ai_manager.push_training_data_classifier({
                        'input' :  [SIGHTFUNCTION_COUNT_OF_ENTS_SURROUNDING,this.player.x,this.player.y],
                        'output':  [0,0,0,0]
                    });
                }
            }
        });
    },

    will_player_move_entity_during_play: function(target_ent) {

        //TODO Switch this to an array with a loop polling each button

        if (this.upButton.isDown ){
            target_ent.setVelocityY(-150);
        } 
        else if (this.downButton.isDown){
            target_ent.setVelocityY(150);
        }
        else {
            target_ent.setVelocityY(0);
        }
        if (this.leftButton.isDown){
            target_ent.setVelocityX(-150);
        }
        else if (this.rightButton.isDown){
            target_ent.setVelocityX(150);
        }
        else {
            target_ent.setVelocityX(0);
        }
    },
    
    ai_move_entity: function (target_ent,direction) {
        if (direction === "down"){
            target_ent.setVelocityY(-150);
        } 
        else if (direction === "up" ){
            target_ent.setVelocityY(150);
        }
        else {
            target_ent.setVelocityY(0);
        }
        if (direction === "left"){
            target_ent.setVelocityX(-150);
        }
        else if (direction === "right"){
            target_ent.setVelocityX(150);
        }
        else {
            target_ent.setVelocityX(0);
        }
    },
    
    getRandomSpeed: function(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },


    //This function will parse a json map file into memory during the create function call. By the end of execution the player should be positioned, buildings should be placed, and npcs placed.  The map should be ready for first tick.
    load_map_from_JSON: function(json_file) {
        //1.
        this.load.json('level_map', json_file);

        //2.
        let map = this.cache.json.get('level_map');

        //3.
        if(map.type === "training") {

            if(map.training_type === "movement") {
                this.training_npc = npc(
                    map.training_npc.type,
                    this.physics.add.sprite(this.sys.game.canvas.width/2, this.sys.game.canvas.height/2, map.training_npc.sprite),
                    npc_core_featureset,
                    null,
                    {
                        nn_network_x: new synaptic.Architect.Perceptron(2, 6, 12, 18, 2),
                        nn_network_y: new synaptic.Architect.Perceptron(2, 6, 12, 18, 2)
                    },
                    [
                        can_save_network_to_JSON, can_load_JSON_networks, can_do_explore_movement, can_check_if_observe_Entity, can_classify_observed_entity, can_pursue_observed_entity, can_flee_observed_entity
                    ],
                    null,
                    null,
                    null
                );
            } else if(map.training_type === "classifying") {
                this.training_npc = npc(
                    map.training_npc.type,
                    this.physics.add.sprite(this.sys.game.canvas.width/2, this.sys.game.canvas.height/2, map.training_npc.sprite),
                    npc_core_featureset,
                    {
                        nn_network_x: new synaptic.Architect.Perceptron(2, 6, 12, 18, 2),
                        nn_network_y: new synaptic.Architect.Perceptron(2, 6, 12, 18, 2)
                    },
                    null,
                    this.physics.add.sprite(this.sys.game.canvas.width/2, this.sys.game.canvas.height/2, map.training_npc.sprite),
                    [
                        can_save_network_to_JSON, can_load_JSON_networks, can_do_explore_movement, can_check_if_observe_Entity, can_classify_observed_entity, can_pursue_observed_entity, can_flee_observed_entity
                    ],
                    null,
                    null,
                    null
                );
            }

            
        } 
        this.player = this.physics.add.sprite(map.player_start_x, map.player_start_y, 'player');

        //4.
        map.npc_list.forEach(npc => {
            this.ai_manager.npcs.push(
                npc(
                    npc.type,
                    this.physics.add.sprite(this.sys.game.canvas.width/2, this.sys.game.canvas.height/2, map.training_npc.sprite),
                    npc_core_featureset,
                    {
                        nn_network_x: new synaptic.Architect.Perceptron(2, 6, 12, 18, 2),
                        nn_network_y: new synaptic.Architect.Perceptron(2, 6, 12, 18, 2)
                    },
                    this.physics.add.sprite(this.sys.game.canvas.width/2, this.sys.game.canvas.height/2, npc.sprite),
                    [
                        can_save_network_to_JSON, can_load_JSON_networks, can_do_explore_movement, can_check_if_observe_Entity, can_classify_observed_entity, can_pursue_observed_entity, can_flee_observed_entity
                    ],
                    null,
                    null,
                    null
                )
            );
        });
        
        //5.
        map.building_list.forEach(building => {
            buildings_arr.push(
                {
                    type: building.type,
                    sprite: this.physics.add.sprite(building.x_pos, building.y_pos, building.sprite)
                }
            )
        });
        
    },


    initialize: function GameLoopScene () {
        Phaser.Scene.call(this, { key: 'GameLoopScene' });
        this.pause_label;
        this.bg;

        this.player; 

        //this.circle_guy;
        this.npc_arr = [];

        this.buildings_arr = [];

        this.move_x_vel;
        this.move_y_vel;

        this.upButton;
        this.downButton;
        this.leftButton;
        this.rightButton;

        this.numpad_keys = [];

        //Phaser insists on running initialize even when the scene is not started, so have to do this
        this.game_mode;
        this.training_sub_mode;
        this.training_complete = false;
        this.training_npc;
    },

    preload: function() {

        //TODO Convert this to a single function that loops throat a JSON file listing assets

        this.load.image('background', 'assets/game/background.png');
        this.load.image('player', 'assets/junks/dude_1.png');
        this.load.image('aggressive_npc', 'assets/sprites/purple_ball.png');
        this.load.image('peaceful_npc', 'assets/sprites/green_ball.png');

        this.load.image('wall_horizontal', 'assets/sprites/wall_horizontal.png');
        this.load.image('wall_vertical', 'assets/sprites/wall_vertical.png');
        this.load.image('wall_connector_horizontal_left', 'assets/sprites/wall_connector_horizontal_left.png');
        this.load.image('wall_connector_horizontal_right', 'assets/sprites/wall_connector_horizontal_right.png');
        this.load.image('wall_connector_vertical_up', 'assets/sprites/wall_connector_vertical_up.png');
        this.load.image('wall_connector_vertical_down', 'assets/sprites/wall_connector_vertical_down.png');
    },

    create: function(init_data) {
        this.game_mode = init_data?.mode_chosen || "training";
        this.training_sub_mode = init_data?.training_sub_mode;
        console.log("GameLoopScene init", this.sys.game.canvas.width);

        // Adding game objects
        this.bg = this.add.tileSprite(0, 0, this.sys.game.canvas.width, this.sys.game.canvas.height, 'background').setOrigin(0).setScrollFactor(0);
        // Pause Functions
        this.pause_label = this.add.text(this.sys.game.canvas.width - 100, 20, 'Pause', { font: '20px Arial', fill: '#fff' });
        this.pause_label.inputEnabled = true;

        //call scene switch, self passes input context
        this.pause_label.setInteractive().on('pointerup',() => {console.log("pause btn clicked"); this.return_to_menu_scene();});

        if(this.game_mode === 'playing') {
            this.load_map_from_JSON('playing-default_scenario.json');
        }   else if( this.game_mode === "training" ){
                //1. Set up game level with configuration for the training scenario
                
                this.player = this.physics.add.sprite(Math.random() * (this.sys.game.canvas.width - 60) + 60, Math.random() * (this.sys.game.canvas.height - 60) + 60, 'player');
                this.player.setCollideWorldBounds(true);

                if(init_data.training_mode === 'movement'){
                    switch(init_data.training_sub_mode) {
                        case 'mov-exploring': this.load_map_from_JSON('training-mov_exploring.json'); break;
                        case 'mov-chasing': this.load_map_from_JSON('training-mov_chasing.json'); break;
                        case 'mov-hiding': this.load_map_from_JSON('training-mov_hiding.json'); break;
                        case 'mov-regainsight': this.load_map_from_JSON('training-mov_regainsight.json'); break;
                        case 'mov-collideobstacle': this.load_map_from_JSON('training-mov_collideobstacle.json'); break;
                    }
                } else if(init_data.training_mode === 'classifying') {
                    switch(init_data.training_sub_mode) {
                        case 'rec-own-hunger': this.load_map_from_JSON('training-rec_own_hunger.json'); break;
                        case 'rec-ally-hunger': this.load_map_from_JSON('training-rec_ally_hunger.json'); break;
                        case 'rec-own-safety': this.load_map_from_JSON('training-rec_own_safety.json'); break;
                        case 'rec-ally-safety': this.load_map_from_JSON('training-rec_ally_safety.json'); break;
                        case 'rec-own-threat': this.load_map_from_JSON('training-rec_own_threat.json'); break;
                        case 'rec-ally-threat': this.load_map_from_JSON('training-rec_ally_threat.json'); break;
                        case 'rec-prey': this.load_map_from_JSON('training-rec_prey.json'); break;
                        case 'rec-ally': this.load_map_from_JSON('training-rec_ally.json'); break;
                        case 'rec-foodobj': this.load_map_from_JSON('training-rec_foodobj.json'); break;
                        case 'rec-hidingplace': this.load_map_from_JSON('training-rec_hidingplace.json'); break;
                        case 'inv-signofthreat': this.load_map_from_JSON('training-inv_signofthreat.json'); break;
                        case 'inv-signofprey': this.load_map_from_JSON('training-inv_signofprey.json'); break;
                        case 'inv-signoffoodobj': this.load_map_from_JSON('training-inv_signoffoodobj.json');break; 
                    }
                }
                //2. Do training tick
                //3. If training done, save network to JSON with appropriate label 
        }

        this.ai_manager.npcs.forEach(npc => {
            this.physics.add.collider(npc.state.sprite, this.player, () => { this.entities_just_collided(); });
            
            this.buildings_arr.forEach(building => this.physics.add.colider(npc.state.sprite, building, () => { this.entity_collided_with_building(); }));
            npc.setCollideWorldBounds(true);
        })

        this.upButton = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
        this.downButton = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
        this.leftButton = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.rightButton = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.escButton = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        //TODO Switch this for a looped-through array
        for(let i = 1; i <= 9; i++){
            this.numpad_keys.push(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes[`NUMPAD_${i}`]));
        }
    },

    update: function () {
        // Playing AGAINST ai Mode
        if( this.game_mode === "playing" ){
            //console.log("Now in Play");
            this.will_player_move_entity_during_play(this.player);
            
            //console.log("AI movement vec ",move_vec);

            //1. Run the classifier for each NPC, feeding it the sight_functions output (either seeing something or not)

            //2. Run the movment networks for each NPC, feeding it the output of the classifier 

            this.ai_manager.npcs.forEach(npc => {

                //This will call will_npc_move() on its own
                this.ai_manager.what_does_npc_think(npc, this.ai_manager.what_does_npc_see(npc));

            });
        }

        // Training AI Mode
        if( this.game_mode === "training" ){

            //When training movement, call movement training function, which submits training data objects for every movement
            if(this.training_sub_mode === "movement") this.will_player_move_entity_during_training();
            if(this.training_sub_mode === "classifier") {
                //When training classifier, call regular movement function
                this.will_player_move_entity_during_play();

                //If a classifier button has been pressed, submit the appropriate training data object, if no button has been pressed, submit a zero press training data object
                this.did_player_push_training_classifier_button();

            } 

            this.ai_manager.npcs.forEach(npc => {

                //This will call will_npc_move() internally
                this.ai_manager.what_does_npc_think(npc, this.ai_manager.what_does_npc_see(npc));
            });

            //
        }

        if(escButton.isDown) return_to_menu_scene(game_mode);

    },
});

var config = {
    type: Phaser.WEBGL,
    width: 800,
    height: 400,
    parent: 'phaser-example',
    scene: [ TitleScreenScene, GameLoopScene ],
    physics: {
        default: 'arcade'
    },
    plugins: {
        global: [
            { key: 'AI_Manager_Plugin', plugin: AI_Manager_Plugin, start: false, mapping: 'ai_manager'}
         ]
     }
    
};

var game = new Phaser.Game(config);