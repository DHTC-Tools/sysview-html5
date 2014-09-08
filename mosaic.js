var lastData = {};
var sites = ["uct2", "iut2", "golub", "taub", "uc3", "uct3"];
var states = ["dead", "offline", "online", "down", "midline"];

var haveData = false;
var width = 80;
var fitWidth = false;
var block = {
	size: 12,
	margin: 2
};
var filter = "";
var filterStates = [];
var filterSites = [];

var fontSize = 10;

var loadedImages = {}; // Dict of image name -> image object
var notFiltered = []; // List of nodes that haven't been filtered out (if we are filtering stuff)

$(document).ready(function() {
	// Get the localStorage data (if any)
	getLocalStorage();

	// Set the controls stuff

	// Set values in input elements
	setControlValues();

	// Set clicks
	$("#toggleControls").click(function() {
		$("#controls").toggle();
	});
	$("#fitWidth").click(function() {
		var isChecked = $("#fitWidth").is(":checked");
		$("#numColumns").prop("disabled", isChecked); //Disable the columns box if fit to screen is chosen
	});
	$("#redraw").click(function() {
		fitWidth = $("#fitWidth").is(":checked") !== undefined ? $("#fitWidth").is(":checked"): fitWidth;

		if(!fitWidth) {
			width = parseInt($("#numColumns").val()) || width;
		}

		block.size = parseInt($("#blockSize").val()) || block.size;
		block.margin = parseInt($("#blockMargin").val()) || block.margin;

		filter = $("#filter").val();

		filterStates = [];
		$("#stateSelect :selected").each(function(sel) {
			filterStates.push($(this).val());
		});

		filterSites = [];
		$("#siteSelect :selected").each(function(sel) {
			filterSites.push($(this).val());
		});

		if(haveData) {
			// If we've gotten data, just redraw
			renderMosaic(lastData, $("canvas")[0]);
		}
		else {
			// Otherwise, retrieve the data
			haveData = true;
			getMosaicData($("canvas")[0]);
		}
		setControlValues();
		setLocalStorage();
	});
	$("#backgroundColor").change(function() {
		if($(this).val() === "White") {
			document.body.style.backgroundColor = "#fff";
			document.body.style.color = "#000";
		}
		else if($(this).val() === "Black") {
			document.body.style.backgroundColor = "#000";
			document.body.style.color = "#fff";
		}

		setLocalStorage();
	});

	$(window).resize(function() {
		// If we're fitting to the screen, we need to adjust on resize
		// If we're not, then just ignore it
		if(!fitWidth) return;

		renderMosaic(lastData, $("canvas")[0]);
		setControlValues();
	});

	// Set everything in motion
	$("#redraw").click();
});

function setControlValues() {
	// Set the controls to the values that are in the variables
	$("#numColumns").val(width);
	$("#blockSize").val(block.size);
	$("#blockMargin").val(block.margin);
	$("#filter").val(filter);
	$("#fitWidth").attr("checked", fitWidth);
}

function getLocalStorage() {
	if(!localStorage) return;

	if(localStorage.mosaicWidth) width = parseInt(localStorage.mosaicWidth);
	if(localStorage.mosaicFitWidth) fitWidth = localStorage.mosaicFitWidth === "true" ? true : false;
	if(localStorage.mosaicBlockSize) block.size = parseInt(localStorage.mosaicBlockSize);
	if(localStorage.mosaicBlockMargin) block.margin = parseInt(localStorage.mosaicBlockMargin);
	if(localStorage.mosaicFilter) filter = localStorage.mosaicFilter;

	if(localStorage.mosaicBackgroundColor) $("#backgroundColor").val(localStorage.mosaicBackgroundColor).trigger("change");
}

function setLocalStorage() {
	if(!localStorage) return;

	localStorage.mosaicWidth = width;
	localStorage.mosaicFitWidth = fitWidth;
	localStorage.mosaicBlockSize = block.size;
	localStorage.mosaicBlockMargin = block.margin;
	localStorage.mosaicFilter = filter;
	localStorage.mosaicBackgroundColor = $("#backgroundColor").val();
}

function getMosaicData(canv) {
	$.ajax({
		dataType: "json",
		url: "mosaic.json",
		success: function(data) {
			console.log(data);
			lastData = data;
			$("#backgroundColor").trigger("change"); // Double check to make sure the background is the right color
			renderMosaic(data, canv)
		},
		error: function(jqXHR, status, error) {
		    // There's been an issue. Let's print it out then try again in two minutes
		    console.log("There's been an error: " + status + ": " + error);

		    // Set to reload in 2 minutes
		    setTimeout(
			function() {
			    console.log("Reloading...");
			    getMosaicData(canv);
			},
			1000 * 60 * 2
		    );	    
		}
	});
}

function renderMosaic(data, canv) {

	// Create the canvas
	var canvas = canv || document.createElement("canvas");
	if(fitWidth) {
		// Set the width based on window width;
		var w = $(window).width();
		width = Math.floor(w / (block.size + block.margin)) - 1;
	}
	canvas.width = width * (block.size + block.margin) + block.margin;

	// Run the nodes through the filter
	notFiltered = [];
	for(var i = 0; i < data.nodes.length; i++) {
		var node = data.nodes[i];

		// See if the node's site is filtered by checking the node's name
		var siteIsChosen = filterSites.length === 0;
		for(var j=0; j < filterSites.length; j++) {
			if(node.name.indexOf(filterSites[j]) !== -1 || filterSites[j] === "All") {
				siteIsChosen = true;
				break;
			}
		}
		if(
		   	  (node.name.indexOf(filter) !== -1) // Filter text
		   && (filterStates.length !== 0 && filterStates.indexOf(node.state) !== -1 || filterStates.indexOf("All") !== -1 || filterStates.length === 0) // filter states
		   && (siteIsChosen) // filter sites
		   ) {
			notFiltered.push(node);
		}
	}
	canvas.height = Math.floor(notFiltered.length / width) * (block.size + block.margin) + block.margin * (3/2);
	if(notFiltered.length % width !== 0) canvas.height += block.size;
	

	// Helper function that turns mouse x/y coordinates to a block index
	var getBlockIndexFromPos = function(x, y) {
		var blockX, blockY, blockIndex;
		blockX = Math.floor((x - block.margin) / (block.size + block.margin));
		blockY = Math.floor((y - block.margin) / (block.size + block.margin));
		
		blockIndex = blockY * width + blockX;
		return blockIndex;
	}

	var getRelativeMousePos = function(e, element) {
		var offset = $(element).offset();

		var pos = { x: -1, y: -1 };
		pos.x = e.pageX - offset.left;
		pos.y = e.pageY - offset.top;

		return pos;
	}

	canvas.onmousemove = function(e) {
		var mousePos = getRelativeMousePos(e, canvas);

		// Get the index under the mouse
		var blockIndex = getBlockIndexFromPos(mousePos.x, mousePos.y);

		// Is it a valid index?
		if(blockIndex >= notFiltered.length || blockIndex < 0) {
			// No
			canvas.style.cursor = "";
			$(canvas).tooltip("option", "content", "");
			$(canvas).tooltip("close");
			return;
		}
		else {
			// If it's valid that also means we can click it
			canvas.style.cursor = "pointer";
		}

		var node = notFiltered[blockIndex];

		// Set the tooltip text from the node's data
		var tooltip = "" + node.name + "<br/> ";
		for(var i=0; i < node.text.length; i++) {
			tooltip += node.text[i] + (i == node.text.length - 1 ? "" : "<br/> ");
		}
		// Set the tooltip's position to the mouse position
		// If the tooltip is halfway down/across the screen, make it switch to the other side of the cursor
		$(".ui-tooltip").css("left", (e.clientX < $(window).width() / 2 ? e.pageX + block.size * 2 : e.pageX - $(".ui-tooltip").width() - block.size * 4));
		$(".ui-tooltip").css("top", (e.clientY < $(window).height() / 2 ? e.pageY + block.size : e.pageY - $(".ui-tooltip").height() - block.size * 2));
		$(canvas).tooltip("option", "content", tooltip);
		// Show the tooltip
		$(canvas).tooltip("open");
	}

	canvas.onmouseup = function(e) {
		var mousePos = getRelativeMousePos(e, canvas);

		// Get the index under the mouse
		var blockIndex = getBlockIndexFromPos(mousePos.x, mousePos.y);

		if(blockIndex >= notFiltered.length || blockIndex < 0) {
			// Not a valid block
			return;
		}

		var node = notFiltered[blockIndex];

		// Construct the url
		var url = "";
		var splitCur = window.location.href.split("/");
		for(var i=0; i < splitCur.length - 1; i++) {
			url += splitCur[i] + "/";
		}
		url += node.link;

		// Go
		window.location.href = url;
	}

	var ctx = canvas.getContext("2d");

	ctx.fillStyle = "#000";

	// Render the squares
	var x = 0, y = 0;
	for(var i=0; i < notFiltered.length; i++) {
		var node = notFiltered[i];

		var rect = {
			x: block.margin + x * (block.margin + block.size),
			y: block.margin + y * (block.margin + block.size),
			w: block.size,
			h: block.size
		}

		ctx.fillStyle = "rgb(" + node.color.r + "," + node.color.g + "," + node.color.b + ")";
		ctx.strokeStyle = "rgb(" + node.background_color.r + "," + node.background_color.g + "," + node.background_color.b + ")";
		ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
		ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

		// Job icons
		if(node.dot_type && node.dot_type !== "prod") {
			// Draw the job icon
			var img = loadedImages[node.dot_type];
			if(!img) {
				// Load the image
				(function(rect) {
					img = new Image();
					img.loadqueue = [rect];
					img.hasloaded = false;
					img.onload = function() {
						for(var i=0; i < this.loadqueue.length; i++) {
							ctx.drawImage(this,
										 this.loadqueue[i].x + this.loadqueue[i].w / 2 - this.width / 2 + 1,
										 this.loadqueue[i].y + this.loadqueue[i].h / 2 - this.height / 2 + 1);
						}
						this.hasloaded = true;
					}
					if(node.dot_type === "?") {
						img.src =  "./unknown.png";
					}
					else {
						img.src = "./" + node.dot_type + ".png";
					}
					// Lets not waste space loading multiple of the same image
					loadedImages[node.dot_type] = img;
				})(rect);
			}
			else {
				// Draw the image
				if(img.hasloaded) {
					// If the image has loaded, just go ahead and draw it
					ctx.drawImage(img, rect.x + rect.w / 2 - img.width / 2 + 1, rect.y + rect.h / 2 - img.height / 2 + 1);
				}
				else {
					// If it's not loaded, tell the image to draw here (rect) when it's done
					img.loadqueue.push(rect);
				}
			}
		}

		x++;
		if(x >= width) {
			x = 0;
			y++;
		}
	}

	$("#status").html("<p>" + data.time + "</p>");

	// Add the canvas to the page
	document.getElementById("canvasContainer").appendChild(canvas);

	// Set up jQuery tooltips
	$(function() {
		$(canvas).tooltip({
			items: "canvas",
			position: {
				at: "top center"
			}
		});
	});

	// Set to reload in 2 minutes
	setTimeout(
		function() {
			console.log("Reloading...");
			getMosaicData(canvas);
		},
		1000 * 60 * 2
	);
}